import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";
import { SERVICE_CATALOG_FIELDS } from "@/lib/airtable-fields";

/**
 * Каталог послуг.
 *
 * Поле "Категорія" (fldLrEyZtzbKproOJ) — multipleRecordLinks на
 * Категорії послуг. Це source of truth. Легасі multiSelect "Вид послуги"
 * більше не читається/не пишеться (пристрій до видалення після QA).
 */

const FIELDS = [
  SERVICE_CATALOG_FIELDS.name,
  SERVICE_CATALOG_FIELDS.workPrice,
  SERVICE_CATALOG_FIELDS.materialsCost,
  SERVICE_CATALOG_FIELDS.materialsPurchaseCost,
  SERVICE_CATALOG_FIELDS.hourlyRate,
  SERVICE_CATALOG_FIELDS.hours,
  SERVICE_CATALOG_FIELDS.category,
  SERVICE_CATALOG_FIELDS.totalPrice,
  SERVICE_CATALOG_FIELDS.duration,
  SERVICE_CATALOG_FIELDS.inactive,
];

function mapService(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const rawCat = f[SERVICE_CATALOG_FIELDS.category];
  const categoryIds: string[] = Array.isArray(rawCat) ? (rawCat as string[]) : [];
  // MVP: один сервіс → одна категорія (UI дозволяє тільки одну).
  const categoryId = categoryIds[0] || "";

  const workPrice = (f[SERVICE_CATALOG_FIELDS.workPrice] as number) || 0;
  const catalogHourlyRate = (f[SERVICE_CATALOG_FIELDS.hourlyRate] as number) || 0;
  const hours = (f[SERVICE_CATALOG_FIELDS.hours] as number) || 0;
  const materialsCost = (f[SERVICE_CATALOG_FIELDS.materialsCost] as number) || 0;
  const materialsPurchaseCost = (f[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] as number) || 0;
  const totalPrice = (f[SERVICE_CATALOG_FIELDS.totalPrice] as number) || 0;

  const isHourly = hours > 0;
  const effectiveRate = isHourly ? (catalogHourlyRate || workPrice) : 0;
  const computedTotal = isHourly
    ? effectiveRate * hours + materialsCost
    : workPrice + materialsCost;

  return {
    id: r.id,
    name: (f[SERVICE_CATALOG_FIELDS.name] as string) || "",
    workPrice,
    hourlyRate: effectiveRate,
    hours,
    materialsCost,
    materialsPurchaseCost,
    totalPrice: computedTotal || totalPrice,
    categoryId,
    duration: (f[SERVICE_CATALOG_FIELDS.duration] as number) || 0,
    isActive: !f[SERVICE_CATALOG_FIELDS.inactive],
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.servicesCatalog, {
      fields: FIELDS,
      sort: [{ field: SERVICE_CATALOG_FIELDS.name, direction: "asc" }],
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
    const { name, workPrice, hourlyRate, hours, materialsCost, materialsPurchaseCost, categoryId, duration } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const fields: Record<string, unknown> = { [SERVICE_CATALOG_FIELDS.name]: name };

    if (workPrice !== undefined) fields[SERVICE_CATALOG_FIELDS.workPrice] = workPrice;
    if (hourlyRate !== undefined) fields[SERVICE_CATALOG_FIELDS.hourlyRate] = hourlyRate;
    if (hours !== undefined) fields[SERVICE_CATALOG_FIELDS.hours] = hours;
    if (materialsCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsCost] = materialsCost;
    if (materialsPurchaseCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = materialsPurchaseCost;
    if (categoryId) fields[SERVICE_CATALOG_FIELDS.category] = [categoryId];
    if (duration !== undefined) fields[SERVICE_CATALOG_FIELDS.duration] = duration;

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
    if (updates.name !== undefined) fields[SERVICE_CATALOG_FIELDS.name] = updates.name;
    if (updates.workPrice !== undefined) fields[SERVICE_CATALOG_FIELDS.workPrice] = updates.workPrice;
    if (updates.hourlyRate !== undefined) fields[SERVICE_CATALOG_FIELDS.hourlyRate] = updates.hourlyRate;
    if (updates.hours !== undefined) fields[SERVICE_CATALOG_FIELDS.hours] = updates.hours;
    if (updates.materialsCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsCost] = updates.materialsCost;
    if (updates.materialsPurchaseCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = updates.materialsPurchaseCost;
    if (updates.categoryId !== undefined) {
      fields[SERVICE_CATALOG_FIELDS.category] = updates.categoryId ? [updates.categoryId] : [];
    }
    if (updates.duration !== undefined) fields[SERVICE_CATALOG_FIELDS.duration] = updates.duration;
    if (updates.isActive !== undefined) {
      fields[SERVICE_CATALOG_FIELDS.inactive] = updates.isActive ? null : true;
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
