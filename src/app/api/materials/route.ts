import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";
import { MATERIAL_FIELDS } from "@/lib/airtable-fields";

// Next 16: Route Handlers кешуються за замовчуванням. Без цього PATCH-архівація
// матеріалу не видна в UI (GET повертає стару кеш-копію).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIELDS = [
  MATERIAL_FIELDS.name,
  MATERIAL_FIELDS.totalVolume,
  MATERIAL_FIELDS.salePrice,
  MATERIAL_FIELDS.costPrice,
  MATERIAL_FIELDS.sku,
  MATERIAL_FIELDS.article,
  MATERIAL_FIELDS.barcode,
  MATERIAL_FIELDS.group,
  MATERIAL_FIELDS.unit,
  MATERIAL_FIELDS.inactive,
];

function mapMaterial(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const totalVolume = (f[MATERIAL_FIELDS.totalVolume] as number) || 0;
  const salePrice = (f[MATERIAL_FIELDS.salePrice] as number) || 0;
  const costPrice = (f[MATERIAL_FIELDS.costPrice] as number) || 0;

  // одиниця is singleSelect → { id, name, color } or string
  const rawUnit = f[MATERIAL_FIELDS.unit];
  const unit =
    typeof rawUnit === "string" ? rawUnit :
    rawUnit && typeof rawUnit === "object" && "name" in (rawUnit as Record<string, unknown>)
      ? (rawUnit as { name: string }).name
      : "";

  return {
    id: r.id,
    name: (f[MATERIAL_FIELDS.name] as string) || "",
    totalVolume,
    salePrice,        // per package (was "Вартість")
    costPrice,        // per package (was coefficient, now real input)
    // Per-unit prices for convenience
    pricePerUnit: totalVolume > 0 ? salePrice / totalVolume : 0,
    costPerUnit: totalVolume > 0 ? costPrice / totalVolume : 0,
    sku: (f[MATERIAL_FIELDS.sku] as string) || "",
    article: (f[MATERIAL_FIELDS.article] as string) || "",
    barcode: (f[MATERIAL_FIELDS.barcode] as string) || "",
    group: (f[MATERIAL_FIELDS.group] as string) || "",
    unit,
    isActive: !f[MATERIAL_FIELDS.inactive],  // checkbox: checked = deactivated
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.calculation, {
      fields: FIELDS,
      sort: [{ field: MATERIAL_FIELDS.name, direction: "asc" }],
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

    const all = await fetchAllRecords(TABLES.calculation, { fields: [MATERIAL_FIELDS.sku] });
    const sku = await nextSku(all.map((r) => (r.fields[MATERIAL_FIELDS.sku] as string) || ""));

    const fields: Record<string, unknown> = {
      [MATERIAL_FIELDS.name]: name,
      [MATERIAL_FIELDS.sku]: sku,
      // неактивний defaults to unchecked = active, no need to set
    };
    if (costPrice !== undefined) fields[MATERIAL_FIELDS.costPrice] = costPrice;
    if (salePrice !== undefined) fields[MATERIAL_FIELDS.salePrice] = salePrice;
    if (totalVolume !== undefined) fields[MATERIAL_FIELDS.totalVolume] = totalVolume;
    if (unit) fields[MATERIAL_FIELDS.unit] = unit;
    if (group) fields[MATERIAL_FIELDS.group] = group;
    if (article) fields[MATERIAL_FIELDS.article] = article;
    if (barcode) fields[MATERIAL_FIELDS.barcode] = barcode;

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
    if (updates.name !== undefined) fields[MATERIAL_FIELDS.name] = updates.name;
    if (updates.costPrice !== undefined) fields[MATERIAL_FIELDS.costPrice] = updates.costPrice;
    if (updates.salePrice !== undefined) fields[MATERIAL_FIELDS.salePrice] = updates.salePrice;
    if (updates.totalVolume !== undefined) fields[MATERIAL_FIELDS.totalVolume] = updates.totalVolume;
    if (updates.unit !== undefined) fields[MATERIAL_FIELDS.unit] = updates.unit || null;
    if (updates.group !== undefined) fields[MATERIAL_FIELDS.group] = updates.group;
    if (updates.article !== undefined) fields[MATERIAL_FIELDS.article] = updates.article;
    if (updates.barcode !== undefined) fields[MATERIAL_FIELDS.barcode] = updates.barcode;
    if (updates.isActive !== undefined) fields[MATERIAL_FIELDS.inactive] = !updates.isActive;

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
