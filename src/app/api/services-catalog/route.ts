import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";

const FIELDS = [
  "Назва",
  "ціна роботи",
  "вартість матеріалів продажа",
  "закупка",
  "ціна за годину",
  "К-сть годин",
  "Вид послуги",
  "вартість послуги",
  "тривалість",
  "неактивний",
];

function mapService(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  // Вид послуги is multipleSelects → array of { id, name, color } objects
  const rawTypes = f["Вид послуги"] as unknown;
  let category = "";
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    const first = rawTypes[0];
    category =
      typeof first === "string" ? first :
      first && typeof first === "object" && "name" in (first as Record<string, unknown>)
        ? (first as { name: string }).name
        : "";
  }

  const workPrice = (f["ціна роботи"] as number) || 0;
  const catalogHourlyRate = (f["ціна за годину"] as number) || 0;
  const hours = (f["К-сть годин"] as number) || 0;
  const materialsCost = (f["вартість матеріалів продажа"] as number) || 0;
  const materialsPurchaseCost = (f["закупка"] as number) || 0;
  const totalPrice = (f["вартість послуги"] as number) || 0;

  // Calculate total correctly for both pricing models
  const isHourly = hours > 0;
  const effectiveRate = isHourly ? (catalogHourlyRate || workPrice) : 0;
  const computedTotal = isHourly
    ? effectiveRate * hours + materialsCost
    : workPrice + materialsCost;

  return {
    id: r.id,
    name: (f["Назва"] as string) || "",
    workPrice,
    hourlyRate: effectiveRate,
    hours,
    materialsCost,
    materialsPurchaseCost,
    totalPrice: computedTotal || totalPrice, // prefer computed, fallback to formula
    category,
    duration: (f["тривалість"] as number) || 0,
    isActive: !f["неактивний"],
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.servicesCatalog, {
      fields: FIELDS,
      sort: [{ field: "Назва", direction: "asc" }],
    });
    return NextResponse.json(records.map(mapService));
  } catch (error) {
    console.error("Failed to fetch services catalog:", error);
    return NextResponse.json({ error: "Failed to fetch services catalog" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, workPrice, hourlyRate, hours, materialsCost, materialsPurchaseCost, category, duration } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const fields: Record<string, unknown> = { "Назва": name };

    if (workPrice !== undefined) fields["ціна роботи"] = workPrice;
    if (hourlyRate !== undefined) fields["ціна за годину"] = hourlyRate;
    if (hours !== undefined) fields["К-сть годин"] = hours;
    if (materialsCost !== undefined) fields["вартість матеріалів продажа"] = materialsCost;
    if (materialsPurchaseCost !== undefined) fields["закупка"] = materialsPurchaseCost;
    if (category) fields["Вид послуги"] = [category];
    if (duration !== undefined) fields["тривалість"] = duration;

    const result = await createRecord(TABLES.servicesCatalog, fields);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create service:", msg);
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
    if (updates.workPrice !== undefined) fields["ціна роботи"] = updates.workPrice;
    if (updates.hourlyRate !== undefined) fields["ціна за годину"] = updates.hourlyRate;
    if (updates.hours !== undefined) fields["К-сть годин"] = updates.hours;
    if (updates.materialsCost !== undefined) fields["вартість матеріалів продажа"] = updates.materialsCost;
    if (updates.materialsPurchaseCost !== undefined) fields["закупка"] = updates.materialsPurchaseCost;
    if (updates.category !== undefined) {
      fields["Вид послуги"] = updates.category ? [updates.category] : [];
    }
    if (updates.duration !== undefined) fields["тривалість"] = updates.duration;
    if (updates.isActive !== undefined) {
      // Checkbox: true to check, null to uncheck (Airtable doesn't accept false)
      fields["неактивний"] = updates.isActive ? null : true;
    }

    console.log("PATCH services-catalog:", id, JSON.stringify(fields));
    await updateRecord(TABLES.servicesCatalog, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update service:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string" || !id.startsWith("rec"))
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    await deleteRecord(TABLES.servicesCatalog, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete service:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
