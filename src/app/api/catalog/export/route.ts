import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

/**
 * GET /api/catalog/export?type=products|materials
 * Returns CSV file download.
 */

function escapeCSV(val: string | number | undefined | null): string {
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
        fields: ["Назва", "ціна закупки", "ціна продажу", "група", "sku", "артикул", "штрих-код"],
        sort: [{ field: "Назва", direction: "asc" }],
      });

      const header = "SKU,Назва,Артикул,Штрих-код,Ціна закупки,Ціна продажу,Група";
      const rows = records.map((r) => {
        const f = r.fields;
        const rawGroup = f["група"];
        const group =
          typeof rawGroup === "string" ? rawGroup :
          rawGroup && typeof rawGroup === "object" && "name" in (rawGroup as Record<string, unknown>)
            ? (rawGroup as { name: string }).name : "";
        return [
          escapeCSV(f["sku"] as string),
          escapeCSV(f["Назва"] as string),
          escapeCSV(f["артикул"] as string),
          escapeCSV(f["штрих-код"] as string),
          escapeCSV(f["ціна закупки"] as number),
          escapeCSV(f["ціна продажу"] as number),
          escapeCSV(group),
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
        fields: ["Name", "закупка", "Вартість", "Всього мл/шт", "одиниця", "група", "sku", "артикул", "штрих-код"],
        sort: [{ field: "Name", direction: "asc" }],
      });

      const header = "SKU,Назва,Артикул,Штрих-код,Ціна закупки,Ціна продажу,Фасування,Одиниця,Група";
      const rows = records.map((r) => {
        const f = r.fields;
        const rawUnit = f["одиниця"];
        const unit =
          typeof rawUnit === "string" ? rawUnit :
          rawUnit && typeof rawUnit === "object" && "name" in (rawUnit as Record<string, unknown>)
            ? (rawUnit as { name: string }).name : "";
        return [
          escapeCSV(f["sku"] as string),
          escapeCSV(f["Name"] as string),
          escapeCSV(f["артикул"] as string),
          escapeCSV(f["штрих-код"] as string),
          escapeCSV(f["закупка"] as number),
          escapeCSV(f["Вартість"] as number),
          escapeCSV(f["Всього мл/шт"] as number),
          escapeCSV(unit),
          escapeCSV(f["група"] as string),
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
