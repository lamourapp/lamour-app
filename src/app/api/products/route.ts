import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";

const FIELDS = [
  "Назва", "ціна продажу", "ціна закупки", "% cалону", "група",
  "sku", "артикул", "штрих-код", "неактивний",
];

function mapProduct(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  // група is singleSelect → Airtable returns { id, name, color } or string
  const rawGroup = f["група"];
  const group =
    typeof rawGroup === "string" ? rawGroup :
    rawGroup && typeof rawGroup === "object" && "name" in (rawGroup as Record<string, unknown>)
      ? (rawGroup as { name: string }).name
      : "";

  return {
    id: r.id,
    name: (f["Назва"] as string) || "",
    salePrice: (f["ціна продажу"] as number) || 0,
    costPrice: (f["ціна закупки"] as number) || 0,
    salonPercent: (f["% cалону"] as number) || 0,
    group,
    sku: (f["sku"] as string) || "",
    article: (f["артикул"] as string) || "",
    barcode: (f["штрих-код"] as string) || "",
    isActive: !f["неактивний"],  // checkbox: checked = deactivated
    // Legacy compat: CreateEntryModal expects `price`
    price: (f["ціна продажу"] as number) || 0,
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.priceList, {
      fields: FIELDS,
      sort: [{ field: "Назва", direction: "asc" }],
    });
    return NextResponse.json(records.map(mapProduct));
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

/** Generate next SKU: P-NNNNNN */
async function nextSku(existing: string[]): Promise<string> {
  let max = 0;
  for (const s of existing) {
    const m = s.match(/^P-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `P-${String(max + 1).padStart(6, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, costPrice, salePrice, group, article, barcode } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    // Fetch existing SKUs for auto-generation
    const all = await fetchAllRecords(TABLES.priceList, { fields: ["sku"] });
    const sku = await nextSku(all.map((r) => (r.fields["sku"] as string) || ""));

    const fields: Record<string, unknown> = {
      "Назва": name,
      "sku": sku,
      // неактивний defaults to unchecked = active, no need to set
    };
    if (costPrice !== undefined) fields["ціна закупки"] = costPrice;
    if (salePrice !== undefined) fields["ціна продажу"] = salePrice;
    if (group) fields["група"] = group;
    if (body.salonPercent !== undefined) fields["% cалону"] = body.salonPercent;
    if (article) fields["артикул"] = article;
    if (barcode) fields["штрих-код"] = barcode;

    const result = await createRecord(TABLES.priceList, fields);
    return NextResponse.json({ success: true, id: result.id, sku });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create product:", msg);
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
    if (updates.name !== undefined) fields["Назва"] = updates.name;
    if (updates.costPrice !== undefined) fields["ціна закупки"] = updates.costPrice;
    if (updates.salePrice !== undefined) fields["ціна продажу"] = updates.salePrice;
    if (updates.group !== undefined) fields["група"] = updates.group || null;
    if (updates.salonPercent !== undefined) fields["% cалону"] = updates.salonPercent;
    if (updates.article !== undefined) fields["артикул"] = updates.article;
    if (updates.barcode !== undefined) fields["штрих-код"] = updates.barcode;
    if (updates.isActive !== undefined) fields["неактивний"] = !updates.isActive;
    // SKU is immutable — never updated via PATCH

    await updateRecord(TABLES.priceList, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update product:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string" || !id.startsWith("rec"))
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    await deleteRecord(TABLES.priceList, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete product:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
