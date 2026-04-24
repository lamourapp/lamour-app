import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { SPECIALIZATION_FIELDS } from "@/lib/airtable-fields";

// Next 16: route cache вимкнено, щоб PATCH-архівація одразу була видна в UI.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Спеціалізації — tenant-defined roles (e.g. "Перукарі", "Лешмейкер", "Адміністратори").
 *
 * Поле "Категорії лінки" (fld1qz210bqIRxbW5) — multipleRecordLinks на
 * Категорії послуг. Це source of truth. Легасі поле `categories`
 * (multipleSelect) більше не читається/не пишеться.
 */

const FIELDS = [
  SPECIALIZATION_FIELDS.name,
  SPECIALIZATION_FIELDS.categoryLinks,
  SPECIALIZATION_FIELDS.description,
  SPECIALIZATION_FIELDS.isActive,
  SPECIALIZATION_FIELDS.sortOrder,
];

function mapSpecialization(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const raw = f[SPECIALIZATION_FIELDS.categoryLinks];
  const categoryIds: string[] = Array.isArray(raw) ? (raw as string[]) : [];
  return {
    id: r.id,
    name: (f[SPECIALIZATION_FIELDS.name] as string) || "",
    categoryIds,
    description: (f[SPECIALIZATION_FIELDS.description] as string) || "",
    // Airtable опускає поле для знятої галочки — див. expense-types/route.ts.
    isActive: f[SPECIALIZATION_FIELDS.isActive] === true,
    sortOrder: (f[SPECIALIZATION_FIELDS.sortOrder] as number) ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";
    const records = await fetchAllRecords(TABLES.specializations, {
      fields: FIELDS,
      sort: [
        { field: SPECIALIZATION_FIELDS.sortOrder, direction: "asc" },
        { field: SPECIALIZATION_FIELDS.name, direction: "asc" },
      ],
    });
    let items = records.map(mapSpecialization);
    if (!showAll) items = items.filter((s) => s.isActive);
    return NextResponse.json(items);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch specializations:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, categoryIds, description, sortOrder } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {
      [SPECIALIZATION_FIELDS.name]: name.trim(),
      [SPECIALIZATION_FIELDS.isActive]: true,
    };
    if (Array.isArray(categoryIds)) fields[SPECIALIZATION_FIELDS.categoryLinks] = categoryIds;
    if (description) fields[SPECIALIZATION_FIELDS.description] = description;
    if (sortOrder !== undefined) fields[SPECIALIZATION_FIELDS.sortOrder] = sortOrder;

    const result = await createRecord(TABLES.specializations, fields);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create specialization:", msg);
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
    if (updates.name !== undefined) fields[SPECIALIZATION_FIELDS.name] = updates.name;
    if (updates.categoryIds !== undefined) fields[SPECIALIZATION_FIELDS.categoryLinks] = updates.categoryIds;
    if (updates.description !== undefined) fields[SPECIALIZATION_FIELDS.description] = updates.description;
    if (updates.sortOrder !== undefined) fields[SPECIALIZATION_FIELDS.sortOrder] = updates.sortOrder;
    if (updates.isActive !== undefined) fields[SPECIALIZATION_FIELDS.isActive] = updates.isActive;

    await updateRecord(TABLES.specializations, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update specialization:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
