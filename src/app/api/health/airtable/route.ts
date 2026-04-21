import { NextResponse } from "next/server";
import { fetchRecords, TABLES } from "@/lib/airtable";
import {
  SERVICE_FIELDS,
  SPECIALIST_FIELDS,
  SERVICE_CATALOG_FIELDS,
  PRICE_LIST_FIELDS,
  MATERIAL_FIELDS,
  SALE_DETAIL_FIELDS,
  CATEGORY_FIELDS,
  SPECIALIZATION_FIELDS,
  SETTINGS_FIELDS,
  ORDER_FIELDS,
} from "@/lib/airtable-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smoke-test для Airtable-схеми.
 *
 * Для кожної таблиці тягнемо 1 запис з УСІМА зареєстрованими полями. Якщо
 * хоч одне поле перейменоване/видалене в Airtable — Airtable повертає 422
 * "Unknown field name", і health-check падає в цьому місці з конкретним
 * списком нерозпізнаних полів.
 *
 * Дешеве (по 1 запиту на таблицю, maxRecords=1) і ловить саме те, що нас
 * вкусило з `Назва` vs `name` у Категоріях.
 *
 * Викликати вручну через /api/health/airtable або з пост-деплой CI (Vercel
 * Deployment Checks). При фейлі повертає 500 + JSON з розшифровкою по таблицях.
 */

type Check = { table: string; fields: readonly string[] };

const CHECKS: Check[] = [
  { table: TABLES.services, fields: Object.values(SERVICE_FIELDS) },
  { table: TABLES.specialists, fields: Object.values(SPECIALIST_FIELDS) },
  { table: TABLES.servicesCatalog, fields: Object.values(SERVICE_CATALOG_FIELDS) },
  { table: TABLES.priceList, fields: Object.values(PRICE_LIST_FIELDS) },
  { table: TABLES.calculation, fields: Object.values(MATERIAL_FIELDS) },
  { table: TABLES.saleDetails, fields: Object.values(SALE_DETAIL_FIELDS) },
  { table: TABLES.categories, fields: Object.values(CATEGORY_FIELDS) },
  { table: TABLES.specializations, fields: Object.values(SPECIALIZATION_FIELDS) },
  { table: TABLES.settings, fields: Object.values(SETTINGS_FIELDS) },
  { table: TABLES.orders, fields: Object.values(ORDER_FIELDS) },
];

// Людські імена для звіту — нехай ідентифікувати зламану таблицю без шпаргалки.
const TABLE_LABELS: Record<string, string> = {
  [TABLES.services]: "Послуги (journal)",
  [TABLES.specialists]: "Співробітники",
  [TABLES.servicesCatalog]: "Список послуг",
  [TABLES.priceList]: "Прайс",
  [TABLES.calculation]: "Калькуляція (матеріали)",
  [TABLES.saleDetails]: "Продажі деталі",
  [TABLES.categories]: "Категорії послуг",
  [TABLES.specializations]: "Спеціалізації",
  [TABLES.settings]: "Settings",
  [TABLES.orders]: "Замовлення",
};

type Result =
  | { table: string; label: string; ok: true; fieldCount: number }
  | { table: string; label: string; ok: false; error: string };

export async function GET() {
  const results = await Promise.all(
    CHECKS.map(async (c): Promise<Result> => {
      const label = TABLE_LABELS[c.table] || c.table;
      try {
        await fetchRecords(c.table, { fields: [...c.fields], maxRecords: 1 });
        return { table: c.table, label, ok: true, fieldCount: c.fields.length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { table: c.table, label, ok: false, error: msg };
      }
    }),
  );

  const failed = results.filter((r): r is Extract<Result, { ok: false }> => !r.ok);
  const status = failed.length === 0 ? "ok" : "fail";

  return NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      totalTables: results.length,
      failedCount: failed.length,
      results,
    },
    { status: failed.length === 0 ? 200 : 500 },
  );
}
