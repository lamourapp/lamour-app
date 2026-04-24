import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";
import { PRICE_LIST_FIELDS } from "@/lib/airtable-fields";

// Next 16: Route Handlers кешуються за замовчуванням. Без цього PATCH-архівація
// товару не видна в UI (GET повертає стару кеш-копію).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FIELDS = [
  PRICE_LIST_FIELDS.name,
  PRICE_LIST_FIELDS.salePrice,
  PRICE_LIST_FIELDS.costPrice,
  PRICE_LIST_FIELDS.sku,
  PRICE_LIST_FIELDS.article,
  PRICE_LIST_FIELDS.barcode,
  PRICE_LIST_FIELDS.inactive,
];

function mapProduct(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  return {
    id: r.id,
    name: (f[PRICE_LIST_FIELDS.name] as string) || "",
    salePrice: (f[PRICE_LIST_FIELDS.salePrice] as number) || 0,
    costPrice: (f[PRICE_LIST_FIELDS.costPrice] as number) || 0,
    // `group` retained for legacy UI compat after Airtable cleanup.
    group: "",
    sku: (f[PRICE_LIST_FIELDS.sku] as string) || "",
    article: (f[PRICE_LIST_FIELDS.article] as string) || "",
    barcode: (f[PRICE_LIST_FIELDS.barcode] as string) || "",
    isActive: !f[PRICE_LIST_FIELDS.inactive],  // checkbox: checked = deactivated
    // Legacy compat: CreateEntryModal expects `price`
    price: (f[PRICE_LIST_FIELDS.salePrice] as number) || 0,
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.priceList, {
      fields: FIELDS,
      sort: [{ field: PRICE_LIST_FIELDS.name, direction: "asc" }],
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
    const { name, costPrice, salePrice, article, barcode } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    // Fetch existing SKUs for auto-generation
    const all = await fetchAllRecords(TABLES.priceList, { fields: [PRICE_LIST_FIELDS.sku] });
    const sku = await nextSku(all.map((r) => (r.fields[PRICE_LIST_FIELDS.sku] as string) || ""));

    const fields: Record<string, unknown> = {
      [PRICE_LIST_FIELDS.name]: name,
      [PRICE_LIST_FIELDS.sku]: sku,
      // неактивний defaults to unchecked = active, no need to set
    };
    if (costPrice !== undefined) fields[PRICE_LIST_FIELDS.costPrice] = costPrice;
    if (salePrice !== undefined) fields[PRICE_LIST_FIELDS.salePrice] = salePrice;
    if (article) fields[PRICE_LIST_FIELDS.article] = article;
    if (barcode) fields[PRICE_LIST_FIELDS.barcode] = barcode;

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
    if (updates.name !== undefined) fields[PRICE_LIST_FIELDS.name] = updates.name;
    if (updates.costPrice !== undefined) fields[PRICE_LIST_FIELDS.costPrice] = updates.costPrice;
    if (updates.salePrice !== undefined) fields[PRICE_LIST_FIELDS.salePrice] = updates.salePrice;
    if (updates.article !== undefined) fields[PRICE_LIST_FIELDS.article] = updates.article;
    if (updates.barcode !== undefined) fields[PRICE_LIST_FIELDS.barcode] = updates.barcode;
    if (updates.isActive !== undefined) fields[PRICE_LIST_FIELDS.inactive] = !updates.isActive;
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
