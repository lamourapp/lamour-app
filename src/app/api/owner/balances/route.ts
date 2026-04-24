import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import { SERVICE_FIELDS, SPECIALIST_FIELDS } from "@/lib/airtable-fields";
import { ROW_METRICS_SOURCE_FIELDS, computeRowMetrics } from "@/lib/service-row";

export const runtime = "nodejs";
// Next 16: без цього баланси показують стару кеш-копію після PATCH у журналі.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /api/owner/balances — lifetime-агрегати, не залежать від періоду:
 *
 *  1) cashByMethod — фактичний залишок коштів у кожній касі (готівка/карта).
 *     Це СУМА всіх рухів за всю історію салону: виручка − витрати − виплати
 *     + довнесення. «unknown» — записи без вказаної каси (історичні, до
 *     впровадження feature «дві каси»).
 *
 *  2) owedToMasters — скільки салон ще винен кожному майстру:
 *       Σ(нарахованого) − Σ(виплаченого)
 *     де нарахованого = masterPay (рахунково від наданих послуг/продажів)
 *                    + debt>0 з comment "Нарахування…" (salary)
 *       виплаченого  = |debt<0| на цього майстра.
 *
 *     Від'ємне owed = переплата майстру (рідко, але інформативно).
 *     Майстри-власники виключені (їх ownerWithdrawals/contributions вже
 *     в P&L).
 */

interface CashBreakdown { cash: number; card: number; unknown: number }
export interface MasterOwed {
  id: string;
  name: string;
  accrued: number;
  paid: number;
  owed: number;
}

interface Response {
  cashByMethod: CashBreakdown;
  cashTotal: number;
  owedToMasters: MasterOwed[];
  owedTotal: number;
}

const FIELDS = [
  SERVICE_FIELDS.master,
  SERVICE_FIELDS.service,
  SERVICE_FIELDS.sales,
  SERVICE_FIELDS.expenseAmount,
  SERVICE_FIELDS.debtAmount,
  SERVICE_FIELDS.paymentType,
  SERVICE_FIELDS.comments,
  SERVICE_FIELDS.isCanceled,
  ...ROW_METRICS_SOURCE_FIELDS,
];

export async function GET() {
  try {
    const [records, specRecs] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: `NOT({${SERVICE_FIELDS.isCanceled}})`,
        fields: FIELDS,
      }),
      fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.name, SPECIALIST_FIELDS.isOwner],
      }),
    ]);

    const specInfo = new Map<string, { name: string; isOwner: boolean }>();
    for (const s of specRecs) {
      specInfo.set(s.id, {
        name: (s.fields[SPECIALIST_FIELDS.name] as string) || "—",
        isOwner: s.fields[SPECIALIST_FIELDS.isOwner] === true,
      });
    }

    const cash: CashBreakdown = { cash: 0, card: 0, unknown: 0 };
    const masterAgg = new Map<string, { accrued: number; paid: number }>();

    for (const r of records) {
      const f = r.fields;
      const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
      const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
      const payment = f[SERVICE_FIELDS.paymentType] as string | undefined;
      const mk: keyof CashBreakdown =
        payment === "готівка" ? "cash" : payment === "карта" ? "card" : "unknown";
      const comment = ((f[SERVICE_FIELDS.comments] as string | undefined) ?? "").trim();
      const isAccrual = /^нарахування/i.test(comment);
      const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
      const masterId = masterLinks && masterLinks.length > 0 ? masterLinks[0] : null;

      const metrics = computeRowMetrics(f);

      // Cash register movement
      if (expense !== 0) {
        cash[mk] -= Math.abs(expense);
      } else if (debt !== 0) {
        if (!isAccrual) cash[mk] += debt; // signed: виплата<0, довнесення>0
      } else {
        cash[mk] += metrics.totalServicePrice + metrics.totalSalePrice;
      }

      // Master liabilities (skip owner-type masters — їх баланс у P&L/owner withdrawals)
      if (masterId) {
        const info = specInfo.get(masterId);
        if (!info || info.isOwner) continue;

        let m = masterAgg.get(masterId);
        if (!m) {
          m = { accrued: 0, paid: 0 };
          masterAgg.set(masterId, m);
        }
        if (expense === 0 && debt === 0) {
          // service/sale row: нарахування від формули
          m.accrued += metrics.masterPayTotal;
        } else if (debt !== 0) {
          if (isAccrual && debt > 0) m.accrued += debt;           // +ЗП salary
          else if (debt < 0) m.paid += Math.abs(debt);            // виплата/аванс
          // debt>0 non-accrual на майстра — "довнесення/корекція", в owed не йде
        }
      }
    }

    const owedToMasters: MasterOwed[] = [...masterAgg.entries()]
      .map(([id, { accrued, paid }]) => ({
        id,
        name: specInfo.get(id)?.name || "—",
        accrued,
        paid,
        owed: accrued - paid,
      }))
      // Показуємо тільки тих, у кого є реальний залишок (≥ 1 грн), щоб не
      // засмічувати блок історичними майстрами з повним розрахунком.
      .filter((m) => Math.abs(m.owed) >= 1)
      .sort((a, b) => b.owed - a.owed);

    const response: Response = {
      cashByMethod: cash,
      cashTotal: cash.cash + cash.card + cash.unknown,
      owedToMasters,
      owedTotal: owedToMasters.reduce((s, m) => s + m.owed, 0),
    };

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("owner/balances failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
