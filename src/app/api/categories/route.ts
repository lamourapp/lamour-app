import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { CATEGORY_FIELDS } from "@/lib/airtable-fields";

// Next 16: route cache вимкнено, щоб PATCH-архівація одразу була видна в UI.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Категорії послуг — tenant-defined taxonomy for service types.
 *
 * This is the single source of truth: Список послуг.Категорія та
 * Спеціалізації.«Категорії лінки» — обидва linked records на цю таблицю.
 * Soft-delete через isActive=false, історію не втрачаємо.
 */

const FIELDS = [
  CATEGORY_FIELDS.name,
  CATEGORY_FIELDS.isActive,
  CATEGORY_FIELDS.sortOrder,
  CATEGORY_FIELDS.description,
  CATEGORY_FIELDS.isRental,
];

function mapCategory(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  return {
    id: r.id,
    name: (f[CATEGORY_FIELDS.name] as string) || "",
    // Airtable опускає поле для знятої галочки — див. expense-types/route.ts.
    isActive: f[CATEGORY_FIELDS.isActive] === true,
    sortOrder: (f[CATEGORY_FIELDS.sortOrder] as number) ?? 0,
    description: (f[CATEGORY_FIELDS.description] as string) || "",
    isRental: f[CATEGORY_FIELDS.isRental] === true,
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";
    const records = await fetchAllRecords(TABLES.categories, {
      fields: FIELDS,
      sort: [
        { field: CATEGORY_FIELDS.sortOrder, direction: "asc" },
        { field: CATEGORY_FIELDS.name, direction: "asc" },
      ],
    });
    let items = records.map(mapCategory);
    if (!showAll) items = items.filter((c) => c.isActive);
    return NextResponse.json(items);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch categories:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, sortOrder } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const fields: Record<string, unknown> = { [CATEGORY_FIELDS.name]: name.trim(), [CATEGORY_FIELDS.isActive]: true };
    if (description) fields[CATEGORY_FIELDS.description] = description;
    if (sortOrder !== undefined) fields[CATEGORY_FIELDS.sortOrder] = sortOrder;
    const result = await createRecord(TABLES.categories, fields);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create category:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id || typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }
    const fields: Record<string, unknown> = {};
    if (updates.name !== undefined) fields[CATEGORY_FIELDS.name] = updates.name;
    if (updates.description !== undefined) fields[CATEGORY_FIELDS.description] = updates.description;
    if (updates.sortOrder !== undefined) fields[CATEGORY_FIELDS.sortOrder] = updates.sortOrder;
    if (updates.isActive !== undefined) fields[CATEGORY_FIELDS.isActive] = updates.isActive;
    if (updates.isRental !== undefined) fields[CATEGORY_FIELDS.isRental] = updates.isRental;
    await updateRecord(TABLES.categories, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update category:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
