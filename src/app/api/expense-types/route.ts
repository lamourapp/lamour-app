import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { EXPENSE_TYPE_FIELDS } from "@/lib/airtable-fields";

// Next.js 16: маршрути Route Handlers кешуються за замовчуванням (full route cache).
// Після PATCH /api/expense-types (архівація) клієнт просить GET — і отримує стару
// кеш-копію, через це UI не бачить зміну. Вимикаємо кеш явно.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Види витрат — довідник типів витрат, керується з Налаштувань.
 *
 * Журнальне поле «Вид витрати» (singleSelect в таблиці Послуги) синхронізоване
 * за конвенцією name-to-name: коли користувач створює новий тип, POST /api/journal
 * пише рядок — Airtable `typecast: true` автододає опцію. Перейменування типу
 * тут НЕ перейменовує його в singleSelect (історичні записи зберігають стару
 * назву як текст). Деактивація ховає тип з випадаючих списків, історія жива.
 *
 * Паттерн CRUD дзеркалить /api/categories — щоб підтримувати бекенд було
 * мінімум новизни.
 */

const FIELDS = [
  EXPENSE_TYPE_FIELDS.name,
  EXPENSE_TYPE_FIELDS.isActive,
  EXPENSE_TYPE_FIELDS.sortOrder,
  EXPENSE_TYPE_FIELDS.description,
];

function mapExpenseType(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  return {
    id: r.id,
    name: (f[EXPENSE_TYPE_FIELDS.name] as string) || "",
    // Airtable НЕ повертає поле для знятої галочки (field просто відсутнє в
    // відповіді), а не `false`. Тому логіка «!== false» давала баг — архівні
    // читались як active. Коректно: `=== true` (checked = active, unchecked
    // або відсутнє = archived).
    isActive: f[EXPENSE_TYPE_FIELDS.isActive] === true,
    sortOrder: (f[EXPENSE_TYPE_FIELDS.sortOrder] as number) ?? 0,
    description: (f[EXPENSE_TYPE_FIELDS.description] as string) || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";
    const records = await fetchAllRecords(TABLES.expenseTypes, {
      fields: FIELDS,
      sort: [
        { field: EXPENSE_TYPE_FIELDS.sortOrder, direction: "asc" },
        { field: EXPENSE_TYPE_FIELDS.name, direction: "asc" },
      ],
    });
    let items = records.map(mapExpenseType);
    if (!showAll) items = items.filter((c) => c.isActive);
    return NextResponse.json(items);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch expense types:", msg);
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
    const fields: Record<string, unknown> = {
      [EXPENSE_TYPE_FIELDS.name]: name.trim(),
      [EXPENSE_TYPE_FIELDS.isActive]: true,
    };
    if (description) fields[EXPENSE_TYPE_FIELDS.description] = description;
    if (sortOrder !== undefined) fields[EXPENSE_TYPE_FIELDS.sortOrder] = sortOrder;
    const result = await createRecord(TABLES.expenseTypes, fields);
    return NextResponse.json({ success: true, id: result.id, name: name.trim() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create expense type:", msg);
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
    if (updates.name !== undefined) fields[EXPENSE_TYPE_FIELDS.name] = updates.name;
    if (updates.description !== undefined) fields[EXPENSE_TYPE_FIELDS.description] = updates.description;
    if (updates.sortOrder !== undefined) fields[EXPENSE_TYPE_FIELDS.sortOrder] = updates.sortOrder;
    if (updates.isActive !== undefined) fields[EXPENSE_TYPE_FIELDS.isActive] = updates.isActive;
    await updateRecord(TABLES.expenseTypes, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update expense type:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
