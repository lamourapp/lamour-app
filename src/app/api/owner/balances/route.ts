import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import { SERVICE_FIELDS, SPECIALIST_FIELDS, PURCHASE_FIELDS } from "@/lib/airtable-fields";
import { cashDeltaForServiceRow, cashDeltaForPurchase, paymentBucket, isAccrualComment } from "@/lib/cash";
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
    const [records, specRecs, purchaseRecs] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: `NOT({${SERVICE_FIELDS.isCanceled}})`,
        fields: FIELDS,
      }),
      fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.name, SPECIALIST_FIELDS.isOwner],
      }),
      fetchAllRecords(TABLES.purchases, {
        fields: [PURCHASE_FIELDS.amount, PURCHASE_FIELDS.paymentType],
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
      const mk = paymentBucket(f[SERVICE_FIELDS.paymentType] as string | undefined);
      const isAccrual = isAccrualComment(f[SERVICE_FIELDS.comments] as string | undefined);
      const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
      const masterId = masterLinks && masterLinks.length > 0 ? masterLinks[0] : null;

      const metrics = computeRowMetrics(f);

      // Рух каси — єдина логіка з cash.ts (cashDeltaForServiceRow).
      cash[mk] += cashDeltaForServiceRow(f, metrics);

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
          // debt>0 non-accrual = повернення переплати / корекція (майстер
          // повертає кошти). Зменшує «виплачено» → owed = accrued − paid стає
          // консистентним з computeBalances (/api/specialists), де
          // masterBalance = Σ masterPayTotal + Σ усі борги. Без цього додатне
          // повернення «зависало» і дашборд показував привид «винні майстрам».
          else if (debt > 0) m.paid -= debt;
        }
      }
    }

    // Виплати постачальникам — реальний відтік з каси. Зменшують відповідну
    // касу (готівка/карта). Це НЕ "витрата" у P&L (собівартість уже відняли
    // через pricing.ts), але кошти фізично пішли — тому каса має просісти.
    for (const p of purchaseRecs) {
      const amount = (p.fields[PURCHASE_FIELDS.amount] as number) || 0;
      if (amount <= 0) continue;
      const mk = paymentBucket(p.fields[PURCHASE_FIELDS.paymentType] as string | undefined);
      cash[mk] += cashDeltaForPurchase(amount);
    }

    const owedToMasters: MasterOwed[] = [...masterAgg.entries()]
      .map(([id, { accrued, paid }]) => ({
        id,
        name: specInfo.get(id)?.name || "—",
        accrued,
        paid,
        owed: accrued - paid,
      }))
      // Показуємо лише тих, у кого є реальний залишок (≥ 1 копійка). Повністю
      // розрахований майстер (owed=0) ховається; будь-яке справжнє копійчане
      // розходження видно як є, без округлення — щоб числа сходились.
      .filter((m) => Math.abs(m.owed) >= 0.005)
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
