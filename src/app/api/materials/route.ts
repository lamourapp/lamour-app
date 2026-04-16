import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";

const FIELDS = [
  "Name", "Всього мл/шт", "Вартість", "закупка",
  "sku", "артикул", "штрих-код", "група", "одиниця",
];

function mapMaterial(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const totalVolume = (f["Всього мл/шт"] as number) || 0;
  const salePrice = (f["Вартість"] as number) || 0;
  const costPrice = (f["закупка"] as number) || 0;

  // одиниця is singleSelect → { id, name, color } or string
  const rawUnit = f["одиниця"];
  const unit =
    typeof rawUnit === "string" ? rawUnit :
    rawUnit && typeof rawUnit === "object" && "name" in (rawUnit as Record<string, unknown>)
      ? (rawUnit as { name: string }).name
      : "";

  return {
    id: r.id,
    name: (f["Name"] as string) || "",
    totalVolume,
    salePrice,        // per package (was "Вартість")
    costPrice,        // per package (was coefficient, now real input)
    // Per-unit prices for convenience
    pricePerUnit: totalVolume > 0 ? salePrice / totalVolume : 0,
    costPerUnit: totalVolume > 0 ? costPrice / totalVolume : 0,
    // Legacy compat for ServiceEntryModal calc materials
    totalCost: salePrice,
    sku: (f["sku"] as string) || "",
    article: (f["артикул"] as string) || "",
    barcode: (f["штрих-код"] as string) || "",
    group: (f["група"] as string) || "",
    unit,
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.calculation, {
      fields: FIELDS,
      sort: [{ field: "Name", direction: "asc" }],
    });
    return NextResponse.json(records.map(mapMaterial));
  } catch (error) {
    console.error("Failed to fetch materials:", error);
    return NextResponse.json({ error: "Failed to fetch materials" }, { status: 500 });
  }
}

/** Generate next SKU: M-NNNNNN */
async function nextSku(existing: string[]): Promise<string> {
  let max = 0;
  for (const s of existing) {
    const m = s.match(/^M-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `M-${String(max + 1).padStart(6, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, costPrice, salePrice, totalVolume, unit, group, article, barcode } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const all = await fetchAllRecords(TABLES.calculation, { fields: ["sku"] });
    const sku = await nextSku(all.map((r) => (r.fields["sku"] as string) || ""));

    const fields: Record<string, unknown> = {
      "Name": name,
      "sku": sku,
    };
    if (costPrice !== undefined) fields["закупка"] = costPrice;
    if (salePrice !== undefined) fields["Вартість"] = salePrice;
    if (totalVolume !== undefined) fields["Всього мл/шт"] = totalVolume;
    if (unit) fields["одиниця"] = unit;
    if (group) fields["група"] = group;
    if (article) fields["артикул"] = article;
    if (barcode) fields["штрих-код"] = barcode;

    const result = await createRecord(TABLES.calculation, fields);
    return NextResponse.json({ success: true, id: result.id, sku });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create material:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id || typeof id !== "string" || !id.startsWith("rec"))
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });

    const fields: Record<string, unknown> = {};
    if (updates.name !== undefined) fields["Name"] = updates.name;
    if (updates.costPrice !== undefined) fields["закупка"] = updates.costPrice;
    if (updates.salePrice !== undefined) fields["Вартість"] = updates.salePrice;
    if (updates.totalVolume !== undefined) fields["Всього мл/шт"] = updates.totalVolume;
    if (updates.unit !== undefined) fields["одиниця"] = updates.unit || null;
    if (updates.group !== undefined) fields["група"] = updates.group;
    if (updates.article !== undefined) fields["артикул"] = updates.article;
    if (updates.barcode !== undefined) fields["штрих-код"] = updates.barcode;

    await updateRecord(TABLES.calculation, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update material:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string" || !id.startsWith("rec"))
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    await deleteRecord(TABLES.calculation, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete material:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
