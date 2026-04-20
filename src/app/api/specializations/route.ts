import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";

/**
 * Спеціалізації — tenant-defined roles (e.g. "Перукарі", "Лешмейкер", "Адміністратори").
 * Each спеціалізація has a list of service categories it can perform. A specialist
 * links to one or more спеціалізації; their union of categories determines which
 * services they are offered in the journal.
 *
 * This replaces the hardcoded ROLES + ROLE_CATEGORIES constants that previously
 * lived in SpecialistModal / ServiceEntryModal. Making it data-driven is a hard
 * requirement for multi-tenant (every salon has different specializations).
 */

const FIELDS = ["name", "categories", "description", "isActive", "sortOrder"];

function mapSpecialization(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const raw = f["categories"];
  let categories: string[] = [];
  if (Array.isArray(raw)) {
    categories = raw
      .map((c) =>
        typeof c === "string"
          ? c
          : c && typeof c === "object" && "name" in (c as Record<string, unknown>)
            ? ((c as { name: string }).name)
            : "",
      )
      .filter(Boolean);
  }
  return {
    id: r.id,
    name: (f["name"] as string) || "",
    categories,
    description: (f["description"] as string) || "",
    isActive: f["isActive"] !== false, // default true (checkbox undefined = not set yet)
    sortOrder: (f["sortOrder"] as number) ?? 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";
    const records = await fetchAllRecords(TABLES.specializations, {
      fields: FIELDS,
      sort: [
        { field: "sortOrder", direction: "asc" },
        { field: "name", direction: "asc" },
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
    const { name, categories, description, sortOrder } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {
      name: name.trim(),
      isActive: true,
    };
    if (Array.isArray(categories)) fields["categories"] = categories;
    if (description) fields["description"] = description;
    if (sortOrder !== undefined) fields["sortOrder"] = sortOrder;

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
    if (updates.name !== undefined) fields["name"] = updates.name;
    if (updates.categories !== undefined) fields["categories"] = updates.categories;
    if (updates.description !== undefined) fields["description"] = updates.description;
    if (updates.sortOrder !== undefined) fields["sortOrder"] = updates.sortOrder;
    if (updates.isActive !== undefined) fields["isActive"] = updates.isActive;

    await updateRecord(TABLES.specializations, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update specialization:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
