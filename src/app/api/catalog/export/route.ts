import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

/**
 * GET /api/catalog/export?type=products|materials
 * Returns CSV file download.
 */

function escapeCSV(val: string | number | boolean | undefined | null): string {
  if (val === undefined || val === null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "products" && type !== "materials") {
    return NextResponse.json({ error: "type must be products or materials" }, { status: 400 });
  }

  try {
    if (type === "products") {
      const records = await fetchAllRecords(TABLES.priceList, {
        fields: ["Назва", "ціна закупки", "ціна продажу", "% cалону", "sku", "артикул", "штрих-код", "неактивний"],
        sort: [{ field: "Назва", direction: "asc" }],
      });

      const header = "SKU,Назва,Артикул,Штрих-код,Ціна закупки,Ціна продажу,% спеціалісту,Активний";
      const rows = records.map((r) => {
        const f = r.fields;
        const salonPct = (f["% cалону"] as number) || 0;
        const specialistPct = salonPct > 0 ? 100 - salonPct : "";
        const isActive = !f["неактивний"];
        return [
          escapeCSV(f["sku"] as string),
          escapeCSV(f["Назва"] as string),
          escapeCSV(f["артикул"] as string),
          escapeCSV(f["штрих-код"] as string),
          escapeCSV(f["ціна закупки"] as number),
          escapeCSV(f["ціна продажу"] as number),
          escapeCSV(specialistPct),
          escapeCSV(isActive ? "так" : "ні"),
        ].join(",");
      });

      const csv = "\uFEFF" + [header, ...rows].join("\n"); // BOM for Excel
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="products_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    } else {
      const records = await fetchAllRecords(TABLES.calculation, {
        fields: ["Name", "закупка", "Вартість", "Всього мл/шт", "одиниця", "sku", "артикул", "штрих-код", "неактивний"],
        sort: [{ field: "Name", direction: "asc" }],
      });

      const header = "SKU,Назва,Артикул,Штрих-код,Ціна закупки,Ціна продажу,Фасування,Одиниця,Активний";
      const rows = records.map((r) => {
        const f = r.fields;
        const rawUnit = f["одиниця"];
        const unit =
          typeof rawUnit === "string" ? rawUnit :
          rawUnit && typeof rawUnit === "object" && "name" in (rawUnit as Record<string, unknown>)
            ? (rawUnit as { name: string }).name : "";
        const isActive = !f["неактивний"];
        return [
          escapeCSV(f["sku"] as string),
          escapeCSV(f["Name"] as string),
          escapeCSV(f["артикул"] as string),
          escapeCSV(f["штрих-код"] as string),
          escapeCSV(f["закупка"] as number),
          escapeCSV(f["Вартість"] as number),
          escapeCSV(f["Всього мл/шт"] as number),
          escapeCSV(unit),
          escapeCSV(isActive ? "так" : "ні"),
        ].join(",");
      });

      const csv = "\uFEFF" + [header, ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="materials_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("export failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
