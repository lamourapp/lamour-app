/**
 * cash.ts — ЄДИНЕ ДЖЕРЕЛО ПРАВДИ для руху коштів у касі.
 *
 * До цього модуля каса рахувалась у 4 місцях незалежними формулами:
 *   - /api/owner/balances (lifetime каса + борги майстрам)
 *   - /api/owner/stats (period cashByMethod)
 *   - /api/owner/cash-history (тренд балансу по днях)
 *   - DashboardScreen.computeMetrics (client-side period каса)
 * Вони розходились у трьох речах: (1) детект «нарахування ЗП» —
 * регістрозалежний `startsWith("Нарахування")` проти `/^нарахування/i`;
 * (2) база виручки — сума share-полів проти `totalServicePrice+totalSalePrice`;
 * (3) чи віднімаються закупки постачальникам. Звідси «дрібні» розходження.
 *
 * Тепер уся логіка руху каси — тут. Дзеркало `pricing.ts` для послуг:
 * чисті функції, без Next/Airtable рантайму, переносяться 1:1 на Postgres.
 *
 * ІНВАРІАНТ: каса = Σ cashDeltaForServiceRow(всі non-canceled service-рядки)
 *                 + Σ cashDeltaForPurchase(всі закупки).
 * Знак: + клієнт поклав у касу / довнесення власника / повернення майстра;
 *       − витрата / виплата майстру / вилучення власника / закупка.
 * Нарахування ЗП → 0 (бухгалтерська liability, не фізичний рух готівки).
 */

import { SERVICE_FIELDS } from "./airtable-fields";
import type { RowMetrics } from "./service-row";
import type { JournalEntry } from "./types";

export type CashBucket = "cash" | "card" | "unknown";

/**
 * Єдиний детект «нарахування ЗП» — бухгалтерський рух (liability), що НЕ
 * рухає готівку. Регістронезалежно, по обрізаному коментарю. Раніше клієнт
 * використовував case-sensitive `startsWith("Нарахування")`, а сервер
 * `/^нарахування/i` — через що той самий запис на різних екранах то рухав
 * касу, то ні.
 */
export function isAccrualComment(comment: string | null | undefined): boolean {
  return /^нарахування/i.test((comment ?? "").trim());
}

/** Каса операції за способом оплати. Порожнє → unknown (історичні записи). */
export function paymentBucket(paymentType: string | null | undefined): CashBucket {
  return paymentType === "готівка" ? "cash" : paymentType === "карта" ? "card" : "unknown";
}

/**
 * Знакова зміна каси від ОДНОГО запису таблиці Послуги (server-side, з сирих
 * Airtable-полів + RowMetrics). Не включає закупки постачальникам — вони в
 * окремій таблиці, див. `cashDeltaForPurchase`.
 *
 * Пріоритет класифікації — взаємовиключний (як було історично): спершу
 * витрата, тоді борг, інакше виручка. Тобто змішаний «послуга+витрата» рядок
 * рахується лише як витрата (відоме обмеження, задокументоване в аудиті).
 */
export function cashDeltaForServiceRow(
  fields: Record<string, unknown>,
  metrics: RowMetrics,
): number {
  const expense = (fields[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
  const debt = (fields[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
  if (expense !== 0) return -Math.abs(expense);
  if (debt !== 0) {
    return isAccrualComment(fields[SERVICE_FIELDS.comments] as string | undefined) ? 0 : debt;
  }
  // Виручка = повна вартість послуги + продажів (те, що клієнт поклав у касу).
  return metrics.totalServicePrice + metrics.totalSalePrice;
}

/** Зміна каси від виплати постачальнику (відтік). `amount` у таблиці > 0. */
export function cashDeltaForPurchase(amount: number | null | undefined): number {
  const a = Math.abs(amount || 0);
  return a === 0 ? 0 : -a; // уникаємо −0
}

/** Сума 6 share-полів запису журналу = повна виручка (робота+матеріали+товари).
 *  Математично = totalServicePrice + totalSalePrice для записів зі снепшотами. */
function entryRevenue(e: JournalEntry): number {
  return (
    (e.salonShare || 0) +
    (e.salonMaterialShare || 0) +
    (e.salonSalesShare || 0) +
    (e.specialistServiceShare || 0) +
    (e.specialistMaterialShare || 0) +
    (e.specialistSalesShare || 0)
  );
}

/**
 * Знакова зміна каси від ОДНОГО запису журналу (client-side, JournalEntry з
 * /api/journal). Дзеркало `cashDeltaForServiceRow`, але працює на вже
 * нормалізованих entries і додатково обробляє тип "purchase" (закупка).
 */
export function cashDeltaForEntry(entry: JournalEntry): number {
  switch (entry.type) {
    case "expense":
      return -Math.abs(entry.amount);
    case "purchase":
      // journal route віддає amount вже від'ємним (−|сума|) для закупок.
      return -Math.abs(entry.amount);
    case "debt":
      return isAccrualComment(entry.comment) ? 0 : entry.amount;
    case "service":
    case "sale":
    case "rental":
      return entryRevenue(entry);
    default:
      return 0;
  }
}
