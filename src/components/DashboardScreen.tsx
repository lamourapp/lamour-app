"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useJournal, useSpecialists, useSettings } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/types";
import { moneyFormatter } from "@/lib/format";

type Fmt = (amount: number, opts?: { signed?: boolean; maximumFractionDigits?: number }) => string;
import CalendarPicker from "./CalendarPicker";

function MetricCard({
  label,
  sublabel,
  value,
  suffix,
  fmt,
  locale = "uk-UA",
  variant = "default",
}: {
  label: string;
  sublabel?: string;
  value: number | string;
  /** When undefined => money (uses fmt). Empty string => plain number. Non-empty => custom unit. */
  suffix?: string;
  fmt?: Fmt;
  locale?: string;
  variant?: "default" | "green" | "green-light" | "brand-dark" | "negative";
}) {
  const styles = {
    default: {
      card: "bg-white border-black/[0.06]",
      label: "text-gray-400",
      value: "text-gray-900",
    },
    green: {
      card: "bg-green-50 border-green-200",
      label: "text-green-700",
      value: "text-green-900",
    },
    "green-light": {
      card: "bg-green-50/50 border-green-100",
      label: "text-green-600",
      value: "text-green-800",
    },
    "brand-dark": {
      card: "border-brand-100 bg-brand-50/50",
      label: "text-brand-500",
      value: "text-brand-700",
    },
    negative: {
      card: "bg-white border-red-100",
      label: "text-red-400",
      value: "text-red-600",
    },
  };
  const s = styles[variant];

  const formatted =
    typeof value === "number"
      ? suffix === undefined
        ? (fmt ? fmt(value) : value.toLocaleString(locale))
        : `${value.toLocaleString(locale)}${suffix ? ` ${suffix}` : ""}`
      : value;

  return (
    <div className={`rounded-xl border p-3.5 transition-transform hover:-translate-y-px ${s.card}`}>
      <div className={`text-[10px] uppercase tracking-wider mb-1 ${s.label}`}>{label}</div>
      {sublabel && <div className="text-[9px] text-gray-400 -mt-0.5 mb-1">{sublabel}</div>}
      <div className={`text-lg font-semibold tabular-nums ${s.value}`}>{formatted}</div>
    </div>
  );
}

const periodButtons = [
  { id: "today", label: "День" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
];

function computeMetrics(entries: JournalEntry[]) {
  // Sum ALL entries — same as Airtable rollups, no type filtering
  let salonServiceShare = 0;
  let salonMaterialShare = 0;
  let salonSalesShare = 0;

  let specialistServiceShare = 0;
  let specialistMaterialShare = 0;
  let specialistSalesShare = 0;

  let expenses = 0;
  let debts = 0; // signed cash movements: + довнесення, − виплата (без нарахувань)
  let paidOut = 0; // |debts < 0| — виплати майстрам/власнику
  let contributed = 0; // debts > 0 — довнесення
  let accrued = 0; // нарахування ЗП (liability, НЕ рух готівки)

  // Розбивка руху каси за способом оплати. Вхідний потік (виручка) − витрати +
  // signed borgs-рух. Для історичних записів без paymentType — bucket "unknown".
  // Сума трьох buckets === cashInRegister (контроль у тестах та дев-режимі).
  type BucketKey = "готівка" | "карта" | "unknown";
  const byMethod: Record<BucketKey, { revenue: number; expenses: number; debts: number }> = {
    "готівка": { revenue: 0, expenses: 0, debts: 0 },
    "карта":   { revenue: 0, expenses: 0, debts: 0 },
    "unknown": { revenue: 0, expenses: 0, debts: 0 },
  };

  let countServices = 0;
  let countSales = 0;
  let countExpenses = 0;
  let countRentals = 0;
  let countPayouts = 0;
  let rentalSum = 0; // rent only, without materials

  for (const e of entries) {
    // Sum financial fields from ALL entries (Airtable doesn't filter by type)
    salonServiceShare += e.salonShare || 0;
    salonMaterialShare += e.salonMaterialShare || 0;
    salonSalesShare += e.salonSalesShare || 0;
    specialistServiceShare += e.specialistServiceShare || 0;
    specialistMaterialShare += e.specialistMaterialShare || 0;
    specialistSalesShare += e.specialistSalesShare || 0;

    const mk: BucketKey =
      e.paymentType === "готівка" ? "готівка"
      : e.paymentType === "карта" ? "карта"
      : "unknown";
    const entryRevenue =
      (e.salonShare || 0) + (e.salonMaterialShare || 0) + (e.salonSalesShare || 0)
      + (e.specialistServiceShare || 0) + (e.specialistMaterialShare || 0) + (e.specialistSalesShare || 0);

    // Type-specific
    if (e.type === "expense") {
      expenses += Math.abs(e.amount);
      byMethod[mk].expenses += Math.abs(e.amount);
      countExpenses++;
    } else if (e.type === "debt") {
      // Нарахування ЗП (salary/hourly) — це liability, а НЕ рух готівки. Вони
      // створюються з debtSign="+" щоб збільшити баланс майстра, але кошти не
      // заходять у касу. Визначаємо за префіксом коментаря (див. StaffScreen).
      const isAccrual = e.amount > 0 && (e.comment ?? "").startsWith("Нарахування");
      if (isAccrual) {
        accrued += e.amount;
        // НЕ додаємо до debts / contributed — касу це не рухає.
      } else {
        debts += e.amount;
        byMethod[mk].debts += e.amount;
        if (e.amount < 0) {
          paidOut += Math.abs(e.amount);
          countPayouts++;
        } else if (e.amount > 0) {
          contributed += e.amount;
        }
      }
    } else if (e.type === "service") {
      countServices++;
      byMethod[mk].revenue += entryRevenue;
    } else if (e.type === "sale") {
      countSales++;
      byMethod[mk].revenue += entryRevenue;
    } else if (e.type === "rental") {
      countRentals++;
      byMethod[mk].revenue += entryRevenue;
      // Rent only = total amount minus materials
      rentalSum += e.amount - (e.materialsCost || 0);
    }
  }

  const salonTotal = salonServiceShare + salonMaterialShare + salonSalesShare;
  const specialistTotal = specialistServiceShare + specialistMaterialShare + specialistSalesShare;
  // Каса = весь вхідний кеш (повна виручка клієнтів + довнесення) − все, що
  // з каси пішло (витрати + виплати майстрам/власнику). Це не «чистий
  // прибуток салону», а саме фізичний залишок готівки/еквіваленту.
  //
  // salonTotal + specialistTotal = повна виручка за період
  //   (клієнт платить всю суму, майстру свою частку виплачуємо окремо).
  // debts signed: + довнесення, − виплата.
  const totalRevenue = salonTotal + specialistTotal;
  const cashInRegister = totalRevenue + debts - expenses;

  const cashByMethod = {
    cash: byMethod["готівка"].revenue + byMethod["готівка"].debts - byMethod["готівка"].expenses,
    card: byMethod["карта"].revenue + byMethod["карта"].debts - byMethod["карта"].expenses,
    unknown: byMethod["unknown"].revenue + byMethod["unknown"].debts - byMethod["unknown"].expenses,
  };

  return {
    salonServiceShare,
    salonMaterialShare,
    salonSalesShare,
    salonTotal,
    specialistServiceShare,
    specialistMaterialShare,
    specialistSalesShare,
    specialistTotal,
    expenses,
    debts,
    paidOut,
    contributed,
    totalRevenue,
    cashInRegister,
    cashByMethod,
    rentalSum,
    countServices,
    countSales,
    countExpenses,
    countRentals,
    countPayouts,
    totalEntries: entries.length,
  };
}

export default function DashboardScreen() {
  const [period, setPeriod] = useState("today");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

  // Залишок у касах — lifetime, не залежить від обраного періоду. Тягнемо
  // один раз з /api/owner/balances (той самий endpoint, що й owner-дашборд).
  // Це «скільки реально лежить у касі просто зараз», а «Рух за період» у
  // Row 3 — окрема метрика period-delta (різниця зрозуміла).
  const [cashBalance, setCashBalance] = useState<{
    cashTotal: number;
    cashByMethod: { cash: number; card: number; unknown: number };
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/owner/balances")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d && typeof d.cashTotal === "number") {
          setCashBalance({ cashTotal: d.cashTotal, cashByMethod: d.cashByMethod });
        }
      })
      .catch(() => { /* не критично — просто не рендеримо картку */ });
    return () => { cancelled = true; };
  }, []);

  const { settings } = useSettings();
  const fmt = useMemo(() => moneyFormatter(settings), [settings]);
  const { entries, loading, error } = useJournal(
    customRange ? "custom" : period,
    selectedSpecialist,
    customRange?.from,
    customRange?.to,
  );
  const { specialists } = useSpecialists();

  const m = useMemo(() => computeMetrics(entries), [entries]);

  // Борги = сума балансів МАЙСТРІВ (без власників). Власники в «Команді» не
  // ЗП-борг командою — сума master-частини всіх, хто має майстерську роль
  // (compensationType ≠ "owner"). Майстер-співвласник потрапляє сюди зі
  // своїм master-балансом (за послуги); owner-частина прибутку лишається
  // в OwnershipScreen. «Чисті» власники з compensationType="owner" сюди
  // не йдуть взагалі — їхній прибуток sensitive і в цей KPI не міксується.
  const totalDebt = useMemo(
    () =>
      specialists.reduce(
        (sum, s) => (s.compensationType === "owner" ? sum : sum + (s.balance || 0)),
        0,
      ),
    [specialists],
  );

  function selectPeriod(p: string) {
    setPeriod(p);
    setCustomRange(null);
    setShowCalendar(false);
  }

  function handleCalendarApply(from: string, to: string) {
    setCustomRange({ from, to });
    setPeriod("");
    setShowCalendar(false);
  }

  const periodLabel = customRange
    ? `${customRange.from.split("-").reverse().join(".")} — ${customRange.to.split("-").reverse().join(".")}`
    : period === "today" ? "Сьогодні"
    : period === "week" ? "Цей тиждень"
    : "Цей місяць";

  // Короткий прийменниковий варіант для підписів типу «Рух за день».
  const periodShort = customRange
    ? "період"
    : period === "today" ? "день"
    : period === "week" ? "тиждень"
    : "місяць";

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-3 mb-5">
        {/* Row 1: period buttons */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5">
              {periodButtons.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPeriod(p.id)}
                  className={`flex-1 px-1 sm:px-3 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all truncate
                    ${period === p.id && !customRange ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                className={`px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer transition-all shrink-0 inline-flex items-center justify-center
                  ${customRange || showCalendar ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                aria-label="Обрати діапазон"
                title="Обрати діапазон"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            {showCalendar && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCalendar(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-black/[0.08] rounded-2xl shadow-xl p-3 z-50">
                  <CalendarPicker
                    onApply={handleCalendarApply}
                    onClose={() => setShowCalendar(false)}
                    initialFrom={customRange?.from}
                    initialTo={customRange?.to}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        {/* Row 2: specialist select */}
        <div className="mt-2">
          <div className="relative inline-block w-full sm:w-auto">
            <select
              value={selectedSpecialist}
              onChange={(e) => setSelectedSpecialist(e.target.value)}
              className="appearance-none w-full sm:w-auto text-[13px] border border-black/[0.08] rounded-xl pl-3 pr-8 py-2 text-gray-700 bg-white cursor-pointer hover:border-brand-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
            >
              <option value="">Всі спеціалісти</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>
        </div>

      </div>

      {/* Loading / Error */}
      {loading && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Завантаження...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-[13px]">Помилка: {error}</div>
      )}

      {!loading && !error && (
        <>
          {/* Залишок у касах (lifetime) — головне число, яке власник/адмін
              хоче бачити одразу: скільки фізично є в готівці/карті зараз.
              Незалежне від обраного періоду (інакше плутається з рухом). */}
          {cashBalance && (
            <div className="mb-4 rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-white px-4 py-3">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[10px] text-brand-600 uppercase tracking-wider font-semibold">
                  Залишок у касах
                </div>
                <div className="text-[18px] font-semibold text-gray-900 tabular-nums">
                  {fmt(Math.round(cashBalance.cashTotal))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px] tabular-nums">
                <div className="flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5 border border-black/[0.03]">
                  <span className="text-gray-500">💵 Готівка</span>
                  <span className="text-gray-900 font-medium">{fmt(Math.round(cashBalance.cashByMethod.cash))}</span>
                </div>
                <div className="flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5 border border-black/[0.03]">
                  <span className="text-gray-500">💳 Карта</span>
                  <span className="text-gray-900 font-medium">{fmt(Math.round(cashBalance.cashByMethod.card))}</span>
                </div>
                {Math.abs(cashBalance.cashByMethod.unknown) > 0.5 && (
                  <div
                    className="col-span-2 flex items-center justify-between bg-white/40 rounded-lg px-2.5 py-1.5 border border-black/[0.03] text-gray-400"
                    title="Історичні записи без вказаної каси"
                  >
                    <span>? Без каси (історичні)</span>
                    <span className="tabular-nums">{fmt(Math.round(cashBalance.cashByMethod.unknown))}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Metrics */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-0.5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Показники · {periodLabel}
              </div>
              <span className="text-[11px] text-gray-400">{m.totalEntries} записів</span>
            </div>

            {/* Row 1: salon share — matches original layout */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <MetricCard label="% салону за послуги" value={Math.round(m.salonServiceShare)} fmt={fmt} />
              <MetricCard label="% салону за матеріали" value={Math.round(m.salonMaterialShare)} fmt={fmt} />
              <MetricCard label="% салону за продажі" value={Math.round(m.salonSalesShare)} fmt={fmt} />
              <MetricCard label="Всього салону" value={Math.round(m.salonTotal)} fmt={fmt} variant="green" />
            </div>

            {/* Row 2: specialist share */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <MetricCard label="% спеціалісту за послуги" value={Math.round(m.specialistServiceShare)} fmt={fmt} />
              <MetricCard label="% спеціалісту за матеріали" value={Math.round(m.specialistMaterialShare)} fmt={fmt} />
              <MetricCard label="% спеціалісту за продажі" value={Math.round(m.specialistSalesShare)} fmt={fmt} />
              <MetricCard label="Всього оплата спеціалісту" value={Math.round(m.specialistTotal)} fmt={fmt} variant="green-light" />
            </div>

            {/* Row 3: debts, expenses, payouts, rental, cash */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <MetricCard
                label="Борги"
                sublabel={totalDebt > 0 ? "салон винен · актуально" : totalDebt < 0 ? "нам винні · актуально" : "баланс · актуально"}
                value={Math.round(totalDebt)}
                fmt={fmt}
                variant={totalDebt !== 0 ? "negative" : "default"}
              />
              <MetricCard label="Витрати" sublabel="операційні" value={Math.round(m.expenses)} fmt={fmt} />
              <MetricCard label="Виплати" sublabel="майстрам і власнику" value={Math.round(m.paidOut)} fmt={fmt} />
              <MetricCard label="Оренда" sublabel="без матеріалів" value={Math.round(m.rentalSum)} fmt={fmt} />
              {/* Рух за період (нетто) — скільки зайшло/вийшло з кас за
                  обраний день/тиждень/місяць. Не плутати з «Залишок у
                  касах» (lifetime, окремою карткою зверху) — тут саме
                  period-delta. Розбивка 💵/💳 теж period-only. */}
              <div
                className="rounded-xl border p-3.5 transition-transform hover:-translate-y-px bg-white border-black/[0.06]"
                title={`Виручка − витрати − виплати за ${periodShort}. 💵 ${fmt(Math.round(m.cashByMethod.cash))}  ·  💳 ${fmt(Math.round(m.cashByMethod.card))}${Math.abs(m.cashByMethod.unknown) > 0.5 ? `  ·  ? ${fmt(Math.round(m.cashByMethod.unknown))}` : ""}`}
              >
                <div className="text-[10px] uppercase tracking-wider mb-1 text-gray-400">Рух за {periodShort}</div>
                <div className="text-[9px] text-gray-400 -mt-0.5 mb-1">виручка − витрати − виплати</div>
                <div className="text-lg font-semibold tabular-nums text-gray-900">
                  {fmt(Math.round(m.cashInRegister))}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 tabular-nums flex items-center gap-2 flex-wrap leading-tight">
                  <span>💵 {fmt(Math.round(m.cashByMethod.cash))}</span>
                  <span className="text-gray-300">·</span>
                  <span>💳 {fmt(Math.round(m.cashByMethod.card))}</span>
                  {Math.abs(m.cashByMethod.unknown) > 0.5 && (
                    <>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400" title="Історичні записи без вказаної каси">? {fmt(Math.round(m.cashByMethod.unknown))}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Row 4: counters */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
            <MetricCard label="Послуг" value={m.countServices} suffix="" />
            <MetricCard label="Продажів" value={m.countSales} suffix="" />
            <MetricCard label="Оренд" value={m.countRentals} suffix="" />
            <MetricCard label="Витрат" value={m.countExpenses} suffix="" />
            <MetricCard label="Виплат" value={m.countPayouts} suffix="" />
          </div>

          {/* Owner analytics entry — full dashboard is at /owner under PIN */}
          <Link
            href="/owner"
            className="block bg-white rounded-xl border border-black/[0.06] p-5 mb-6 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:border-brand-500/40 group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center text-lg shrink-0">
                🔒
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">Аналітика власника</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  Маржинальність, витрати-пиріг, порівняння майстрів і послуг · під PIN
                </div>
              </div>
              <div className="text-gray-300 group-hover:text-brand-600 transition-colors text-lg shrink-0">
                →
              </div>
            </div>
          </Link>

        </>
      )}
    </div>
  );
}
