import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import { SERVICE_FIELDS } from "@/lib/airtable-fields";
import { ROW_METRICS_SOURCE_FIELDS, computeRowMetrics } from "@/lib/service-row";

export const runtime = "nodejs";

/**
 * /api/owner/cash-history?days=30 — історія залишку у касах по днях.
 *
 * Дзеркало логіки /api/owner/balances, але з розбивкою по даті:
 *   1) беремо всі non-canceled service records за всю історію;
 *   2) для кожного рахуємо cash-delta (+виручка / −витрати / +-debt non-accrual);
 *   3) агрегуємо по даті;
 *   4) накопичуємо баланс з першого дня, заповнюючи проміжки (дні без руху =
 *      баланс попереднього дня — інакше графік буде рваним і брехливим);
 *   5) повертаємо останні N днів.
 *
 * Використовується в owner-дашборді під «Залишком у касах» для sparkline
 * тенденції балансу (не виручки — саме стан каси).
 */

export interface CashHistoryPoint {
  date: string; // YYYY-MM-DD
  balance: number;
}

interface Response {
  days: number;
  history: CashHistoryPoint[];
  /** Δ balance[last] − balance[first] у вікні. null якщо < 2 точок. */
  delta: number | null;
}

const FIELDS = [
  SERVICE_FIELDS.date,
  SERVICE_FIELDS.expenseAmount,
  SERVICE_FIELDS.debtAmount,
  SERVICE_FIELDS.comments,
  SERVICE_FIELDS.isCanceled,
  ...ROW_METRICS_SOURCE_FIELDS,
];

/** YYYY-MM-DD → Date у UTC. */
function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const daysParam = Number(url.searchParams.get("days")) || 30;
    const days = Math.max(1, Math.min(365, daysParam)); // розумні межі

    // Сервер на Vercel працює в UTC, тому `new Date()` тут поверне UTC-сьогодні.
    // Юзер у Києві о 02:00 за локальним часом — UTC ще «вчора» → останній день
    // на графіку був би на 1 коротшим. Клієнт може передати `?today=YYYY-MM-DD`
    // зі свого `todayISO()`, тоді графік закінчується на локальному «сьогодні».
    const todayParam = url.searchParams.get("today");
    const todayISO = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam)
      ? todayParam
      : toISODate(new Date());

    const records = await fetchAllRecords(TABLES.services, {
      filterByFormula: `NOT({${SERVICE_FIELDS.isCanceled}})`,
      fields: FIELDS,
    });

    // 1) deltaByDate: сумарна зміна каси за кожен день.
    const deltaByDate = new Map<string, number>();
    for (const r of records) {
      const f = r.fields;
      const date = f[SERVICE_FIELDS.date] as string | undefined;
      if (!date) continue; // без дати не можемо розмістити на таймлайні

      const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
      const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
      const comment = ((f[SERVICE_FIELDS.comments] as string | undefined) ?? "").trim();
      const isAccrual = /^нарахування/i.test(comment);

      let delta = 0;
      if (expense !== 0) {
        delta = -Math.abs(expense);
      } else if (debt !== 0) {
        if (!isAccrual) delta = debt; // signed
      } else {
        const m = computeRowMetrics(f);
        delta = m.totalServicePrice + m.totalSalePrice;
      }
      if (delta === 0) continue;

      deltaByDate.set(date, (deltaByDate.get(date) || 0) + delta);
    }

    if (deltaByDate.size === 0) {
      return NextResponse.json<Response>({ days, history: [], delta: null });
    }

    // 2) Сортуємо дати і будуємо cumulative balance від першого дня до сьогодні,
    //    заповнюючи дні без руху попереднім балансом.
    const sortedDates = [...deltaByDate.keys()].sort();
    const startDate = parseISODate(sortedDates[0]);
    const today = parseISODate(todayISO);

    const daily: CashHistoryPoint[] = [];
    let balance = 0;
    let cursor = startDate;
    while (cursor.getTime() <= today.getTime()) {
      const iso = toISODate(cursor);
      balance += deltaByDate.get(iso) || 0;
      daily.push({ date: iso, balance });
      cursor = addDays(cursor, 1);
    }

    // 3) Останні N днів. Якщо історія коротша — віддаємо що є.
    const history = daily.slice(-days);
    const delta = history.length >= 2
      ? history[history.length - 1].balance - history[0].balance
      : null;

    return NextResponse.json<Response>({ days, history, delta });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("owner/cash-history failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
