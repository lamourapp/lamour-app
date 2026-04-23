import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, deleteRecord, TABLES } from "@/lib/airtable";
import { SERVICE_CATALOG_FIELDS, MATERIAL_FIELDS } from "@/lib/airtable-fields";

/**
 * Каталог послуг.
 *
 * Поле "Категорія" (fldLrEyZtzbKproOJ) — multipleRecordLinks на
 * Категорії послуг. Це source of truth. Легасі multiSelect "Вид послуги"
 * більше не читається/не пишеться (пристрій до видалення після QA).
 *
 * Калькулятор послуги (2026-04):
 *   - `Калькуляція` (checkbox) — enable flag.
 *   - `Склад калькуляції` (long text) — JSON [{materialId, qty}].
 *   - При GET — якщо ввімкнено, joinимо з каталогом матеріалів і рахуємо
 *     живу вартість матеріалів за поточним прайсом (salePrice / totalVolume).
 *     Повертаємо calculatorItems[] + перезаписуємо materialsCost/
 *     materialsPurchaseCost у відповіді (live). В Airtable зберігаються
 *     snapshot-и на момент останнього write, але consumers каталогу
 *     читають через наш API → бачать завжди актуальне.
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
  SERVICE_CATALOG_FIELDS.hasCalculator,
  SERVICE_CATALOG_FIELDS.calculatorJson,
];

interface MaterialInfo {
  id: string;
  name: string;
  salePrice: number;
  costPrice: number;
  totalVolume: number;
}

interface CalculatorItemInput {
  materialId: string;
  qty: number;
}

interface CalculatorItemOut {
  materialId: string;
  materialName: string;
  qty: number;
  pricePerUnit: number; // salePrice / totalVolume
  costPerUnit: number; // costPrice / totalVolume
  cost: number; // qty × pricePerUnit
  purchaseCost: number; // qty × costPerUnit
}

function parseCalcJson(raw: unknown): CalculatorItemInput[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === "object" && typeof x.materialId === "string")
      .map((x) => ({
        materialId: x.materialId,
        qty: typeof x.qty === "number" ? x.qty : parseFloat(x.qty) || 0,
      }));
  } catch {
    return [];
  }
}

function resolveCalculatorItems(
  items: CalculatorItemInput[],
  materialById: Map<string, MaterialInfo>,
): { items: CalculatorItemOut[]; totalSale: number; totalPurchase: number } {
  let totalSale = 0;
  let totalPurchase = 0;
  const out: CalculatorItemOut[] = [];
  for (const it of items) {
    const mat = materialById.get(it.materialId);
    if (!mat) continue;
    const pricePerUnit = mat.totalVolume > 0 ? mat.salePrice / mat.totalVolume : 0;
    const costPerUnit = mat.totalVolume > 0 ? mat.costPrice / mat.totalVolume : 0;
    const cost = it.qty * pricePerUnit;
    const purchaseCost = it.qty * costPerUnit;
    totalSale += cost;
    totalPurchase += purchaseCost;
    out.push({
      materialId: it.materialId,
      materialName: mat.name,
      qty: it.qty,
      pricePerUnit,
      costPerUnit,
      cost,
      purchaseCost,
    });
  }
  return { items: out, totalSale, totalPurchase };
}

function mapService(
  r: { id: string; fields: Record<string, unknown> },
  materialById: Map<string, MaterialInfo>,
) {
  const f = r.fields;
  const rawCat = f[SERVICE_CATALOG_FIELDS.category];
  const categoryIds: string[] = Array.isArray(rawCat) ? (rawCat as string[]) : [];
  const categoryId = categoryIds[0] || "";

  const workPrice = (f[SERVICE_CATALOG_FIELDS.workPrice] as number) || 0;
  const catalogHourlyRate = (f[SERVICE_CATALOG_FIELDS.hourlyRate] as number) || 0;
  const hours = (f[SERVICE_CATALOG_FIELDS.hours] as number) || 0;
  let materialsCost = (f[SERVICE_CATALOG_FIELDS.materialsCost] as number) || 0;
  let materialsPurchaseCost = (f[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] as number) || 0;
  const totalPrice = (f[SERVICE_CATALOG_FIELDS.totalPrice] as number) || 0;
  const hasCalculator = f[SERVICE_CATALOG_FIELDS.hasCalculator] === true;

  let calculatorItems: CalculatorItemOut[] = [];
  if (hasCalculator) {
    const parsed = parseCalcJson(f[SERVICE_CATALOG_FIELDS.calculatorJson]);
    const resolved = resolveCalculatorItems(parsed, materialById);
    calculatorItems = resolved.items;
    // Live: перезаписуємо materialsCost / materialsPurchaseCost актуальними.
    materialsCost = Math.round(resolved.totalSale);
    materialsPurchaseCost = Math.round(resolved.totalPurchase);
  }

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
    hasCalculator,
    calculatorItems,
  };
}

async function loadMaterialsMap(): Promise<Map<string, MaterialInfo>> {
  const records = await fetchAllRecords(TABLES.calculation, {
    fields: [
      MATERIAL_FIELDS.name,
      MATERIAL_FIELDS.totalVolume,
      MATERIAL_FIELDS.salePrice,
      MATERIAL_FIELDS.costPrice,
    ],
  });
  const map = new Map<string, MaterialInfo>();
  for (const r of records) {
    const f = r.fields;
    map.set(r.id, {
      id: r.id,
      name: (f[MATERIAL_FIELDS.name] as string) || "",
      salePrice: (f[MATERIAL_FIELDS.salePrice] as number) || 0,
      costPrice: (f[MATERIAL_FIELDS.costPrice] as number) || 0,
      totalVolume: (f[MATERIAL_FIELDS.totalVolume] as number) || 0,
    });
  }
  return map;
}

export async function GET() {
  try {
    // Fetch каталогу послуг і матеріалів паралельно — калькулятор потребує
    // актуальних цін з materials для live-перерахунку.
    const [records, materialById] = await Promise.all([
      fetchAllRecords(TABLES.servicesCatalog, {
        fields: FIELDS,
        sort: [{ field: SERVICE_CATALOG_FIELDS.name, direction: "asc" }],
      }),
      loadMaterialsMap(),
    ]);
    return NextResponse.json(records.map((r) => mapService(r, materialById)));
  } catch (error) {
    console.error("Failed to fetch services catalog:", error);
    return NextResponse.json({ error: "Failed to fetch services catalog" }, { status: 500 });
  }
}

/**
 * Рахує snapshot materialsCost/materialsPurchaseCost за поточним прайсом
 * матеріалів. Викликається з POST/PATCH коли hasCalculator=true — щоб
 * Airtable мав актуальний snapshot на момент write (для legacy читачів
 * поза нашим API).
 */
async function computeSnapshot(items: CalculatorItemInput[]): Promise<{
  materialsCost: number;
  materialsPurchaseCost: number;
}> {
  const materialById = await loadMaterialsMap();
  const { totalSale, totalPurchase } = resolveCalculatorItems(items, materialById);
  return {
    materialsCost: Math.round(totalSale),
    materialsPurchaseCost: Math.round(totalPurchase),
  };
}

function sanitizeCalculatorItems(raw: unknown): CalculatorItemInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object" && typeof x.materialId === "string" && x.materialId)
    .map((x) => ({
      materialId: x.materialId as string,
      qty: typeof x.qty === "number" ? x.qty : parseFloat(x.qty) || 0,
    }))
    .filter((x) => x.qty > 0);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      workPrice,
      hourlyRate,
      hours,
      materialsCost,
      materialsPurchaseCost,
      categoryId,
      duration,
      hasCalculator,
      calculatorItems,
    } = body;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const fields: Record<string, unknown> = { [SERVICE_CATALOG_FIELDS.name]: name };

    if (workPrice !== undefined) fields[SERVICE_CATALOG_FIELDS.workPrice] = workPrice;
    if (hourlyRate !== undefined) fields[SERVICE_CATALOG_FIELDS.hourlyRate] = hourlyRate;
    if (hours !== undefined) fields[SERVICE_CATALOG_FIELDS.hours] = hours;
    if (categoryId) fields[SERVICE_CATALOG_FIELDS.category] = [categoryId];
    if (duration !== undefined) fields[SERVICE_CATALOG_FIELDS.duration] = duration;

    // Calculator path — коли увімкнений, materialsCost/materialsPurchaseCost
    // обчислюються зі складу; ручні значення ігноруються.
    if (hasCalculator === true) {
      const items = sanitizeCalculatorItems(calculatorItems);
      const snap = await computeSnapshot(items);
      fields[SERVICE_CATALOG_FIELDS.hasCalculator] = true;
      fields[SERVICE_CATALOG_FIELDS.calculatorJson] = JSON.stringify(items);
      fields[SERVICE_CATALOG_FIELDS.materialsCost] = snap.materialsCost;
      fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = snap.materialsPurchaseCost;
    } else {
      // Без калькулятора — пишемо ручні значення як раніше.
      if (materialsCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsCost] = materialsCost;
      if (materialsPurchaseCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = materialsPurchaseCost;
    }

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
    if (updates.categoryId !== undefined) {
      fields[SERVICE_CATALOG_FIELDS.category] = updates.categoryId ? [updates.categoryId] : [];
    }
    if (updates.duration !== undefined) fields[SERVICE_CATALOG_FIELDS.duration] = updates.duration;
    if (updates.isActive !== undefined) {
      fields[SERVICE_CATALOG_FIELDS.inactive] = updates.isActive ? null : true;
    }

    // Calculator branch — симетрично POST.
    if (updates.hasCalculator === true) {
      const items = sanitizeCalculatorItems(updates.calculatorItems);
      const snap = await computeSnapshot(items);
      fields[SERVICE_CATALOG_FIELDS.hasCalculator] = true;
      fields[SERVICE_CATALOG_FIELDS.calculatorJson] = JSON.stringify(items);
      fields[SERVICE_CATALOG_FIELDS.materialsCost] = snap.materialsCost;
      fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = snap.materialsPurchaseCost;
    } else if (updates.hasCalculator === false) {
      // Вимкнули калькулятор — скидаємо прапорець і JSON, materialsCost
      // очікуємо в payload явно (користувач ввів вручну).
      fields[SERVICE_CATALOG_FIELDS.hasCalculator] = null;
      fields[SERVICE_CATALOG_FIELDS.calculatorJson] = "";
      if (updates.materialsCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsCost] = updates.materialsCost;
      if (updates.materialsPurchaseCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = updates.materialsPurchaseCost;
    } else {
      // hasCalculator не передано — просто правимо materialsCost як раніше.
      if (updates.materialsCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsCost] = updates.materialsCost;
      if (updates.materialsPurchaseCost !== undefined) fields[SERVICE_CATALOG_FIELDS.materialsPurchaseCost] = updates.materialsPurchaseCost;
    }

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
