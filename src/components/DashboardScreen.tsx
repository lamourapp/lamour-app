"use client";

import { useState, useMemo } from "react";
import { useJournal, useSpecialists, useSettings } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/demo-data";
import { moneyFormatter, localeFromTimezone } from "@/lib/format";

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
  let debts = 0;

  let countServices = 0;
  let countSales = 0;
  let countExpenses = 0;
  let countRentals = 0;
  let rentalSum = 0; // rent only, without materials

  for (const e of entries) {
    // Sum financial fields from ALL entries (Airtable doesn't filter by type)
    salonServiceShare += e.salonShare || 0;
    salonMaterialShare += e.salonMaterialShare || 0;
    salonSalesShare += e.salonSalesShare || 0;
    specialistServiceShare += e.specialistServiceShare || 0;
    specialistMaterialShare += e.specialistMaterialShare || 0;
    specialistSalesShare += e.specialistSalesShare || 0;

    // Type-specific
    if (e.type === "expense") {
      expenses += Math.abs(e.amount);
      countExpenses++;
    } else if (e.type === "debt") {
      debts += e.amount;
    } else if (e.type === "service") {
      countServices++;
    } else if (e.type === "sale") {
      countSales++;
    } else if (e.type === "rental") {
      countRentals++;
      // Rent only = total amount minus materials
      rentalSum += e.amount - (e.materialsCost || 0);
    }
  }

  const salonTotal = salonServiceShare + salonMaterialShare + salonSalesShare;
  const specialistTotal = specialistServiceShare + specialistMaterialShare + specialistSalesShare;
  const cashInRegister = salonTotal - expenses;

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
    cashInRegister,
    rentalSum,
    countServices,
    countSales,
    countExpenses,
    countRentals,
    totalEntries: entries.length,
  };
}

export default function DashboardScreen() {
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [period, setPeriod] = useState("today");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [showDetailCols, setShowDetailCols] = useState(false);

  const { settings } = useSettings();
  const fmt = useMemo(() => moneyFormatter(settings), [settings]);
  const locale = localeFromTimezone(settings?.timezone);
  const { entries, loading, error } = useJournal(
    customRange ? "custom" : period,
    selectedSpecialist,
    customRange?.from,
    customRange?.to,
  );
  const { specialists } = useSpecialists();

  const m = useMemo(() => computeMetrics(entries), [entries]);

  // Борги = сума балансів всіх спеціалістів (rollup з Airtable)
  const totalDebt = useMemo(
    () => specialists.reduce((sum, s) => sum + (s.balance || 0), 0),
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

  // Dot color helper
  function dotColor(type: JournalEntry["type"]) {
    switch (type) {
      case "service": return "bg-brand-400";
      case "sale": return "bg-emerald-400";
      case "expense": return "bg-gray-300";
      case "rental": return "bg-amber-400";
      case "debt": return "bg-red-400";
      default: return "bg-gray-300";
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-black/[0.06] p-3 mb-5">
        {/* Row 1: period buttons */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5 flex-1 min-w-0">
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
              onClick={() => setShowCalendar(!showCalendar)}
              className={`px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer transition-all shrink-0
                ${customRange ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              📅
            </button>
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

        {showCalendar && (
          <CalendarPicker
            onApply={handleCalendarApply}
            onClose={() => setShowCalendar(false)}
            initialFrom={customRange?.from}
            initialTo={customRange?.to}
          />
        )}
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

            {/* Row 3: debts, expenses, rental, cash */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard
                label="Борги"
                sublabel={totalDebt > 0 ? "салон винен · актуально" : totalDebt < 0 ? "нам винні · актуально" : "баланс · актуально"}
                value={Math.round(totalDebt)}
                fmt={fmt}
                variant={totalDebt !== 0 ? "negative" : "default"}
              />
              <MetricCard label="Витрати" value={Math.round(m.expenses)} fmt={fmt} />
              <MetricCard label="Оренда" sublabel="без матеріалів" value={Math.round(m.rentalSum)} fmt={fmt} />
              <MetricCard label="Кошти в касі" value={Math.round(m.cashInRegister)} fmt={fmt} />
            </div>
          </div>

          {/* Row 4: counters */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            <MetricCard label="Послуг" value={m.countServices} suffix="" />
            <MetricCard label="Продажів" value={m.countSales} suffix="" />
            <MetricCard label="Оренд" value={m.countRentals} suffix="" />
            <MetricCard label="Витрат" value={m.countExpenses} suffix="" />
          </div>

          {/* PIN block */}
          {!pinUnlocked ? (
            <div className="bg-white rounded-xl border border-black/[0.06] p-6 text-center mb-6">
              <div className="text-gray-400 text-[12px] mb-3">🔒 Розширена аналітика для власника</div>
              <div className="flex justify-center gap-2 mb-3">
                {[1, 2, 3, 4].map((i) => (
                  <input
                    key={i}
                    type="password"
                    maxLength={1}
                    className="w-10 h-11 text-center text-lg border border-black/10 rounded-lg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition-colors"
                  />
                ))}
              </div>
              <button
                onClick={() => setPinUnlocked(true)}
                className="bg-brand-600 text-white rounded-[10px] font-medium text-[13px] px-6 py-2 cursor-pointer hover:bg-brand-700 transition-colors"
              >
                Ввести PIN
              </button>
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3 px-0.5">
                <div className="text-[10px] font-semibold text-brand-600 uppercase tracking-widest">
                  🔓 Аналітика власника
                </div>
                <button
                  onClick={() => setPinUnlocked(false)}
                  className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  Заблокувати
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <MetricCard
                  label="Загальний оборот"
                  value={Math.round(m.salonTotal + m.specialistTotal)}
                  fmt={fmt}
                  variant="brand-dark"
                />
                <MetricCard label="Чистий дохід салону" value={Math.round(m.cashInRegister)} fmt={fmt} variant="brand-dark" />
                <MetricCard
                  label="Середній чек послуги"
                  value={m.countServices > 0 ? Math.round((m.salonServiceShare + m.specialistServiceShare) / m.countServices) : 0}
                  fmt={fmt}
                />
                <MetricCard
                  label="Середній чек продажу"
                  value={m.countSales > 0 ? Math.round((m.salonSalesShare + m.specialistSalesShare) / m.countSales) : 0}
                  fmt={fmt}
                />
              </div>
            </div>
          )}

          {/* Journal table */}
          <div>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                Журнал за період
              </div>
              <span className="text-[11px] text-gray-400">{entries.length} записів</span>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-[13px]">Немає записів за цей період</div>
            ) : (
              <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
                <div className="overflow-x-auto max-h-[70vh] relative">
                  <table className="w-full text-[12px] border-collapse">
                    <thead className="sticky top-0 z-20 bg-white">
                      <tr className="border-b border-black/5">
                        <th className="sticky left-0 z-30 bg-white text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider min-w-[52px]">
                          Дата
                        </th>
                        <th className="sticky left-[52px] z-30 bg-white text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider min-w-[100px] border-r border-black/5">
                          {settings?.specialistTerm || "Спеціаліст"}
                        </th>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                          Послуга / Продаж / Витрата
                        </th>
                        <th className="text-right px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                          Вартість
                        </th>
                        <th className="text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                          Коментар
                        </th>
                        {showDetailCols && (
                          <>
                            {["Допов.", "Калькул.", "Матер.", "% спец.", "% салону"].map((h) => (
                              <th key={h} className="text-right px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                                {h}
                              </th>
                            ))}
                            <th className="text-center px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                              Автор
                            </th>
                          </>
                        )}
                        <th className="sticky right-0 z-30 bg-white px-2 py-2.5">
                          <button
                            onClick={() => setShowDetailCols(!showDetailCols)}
                            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 text-[11px] font-bold cursor-pointer transition-colors flex items-center justify-center"
                            title={showDetailCols ? "Сховати деталі" : "Показати деталі"}
                          >
                            {showDetailCols ? "−" : "+"}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => {
                        const textColor = e.type === "expense" ? "text-gray-500" : "text-gray-700";
                        const dateStr = new Date(e.date + "T00:00:00").toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

                        return (
                          <tr key={e.id} className="border-b border-black/[0.03] hover:bg-gray-50/50">
                            <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-500 whitespace-nowrap tabular-nums">{dateStr}</td>
                            <td className={`sticky left-[52px] z-10 bg-white px-3 py-2.5 whitespace-nowrap font-medium border-r border-black/5 ${e.specialistName ? "text-gray-900" : "text-gray-400"}`}>
                              {e.specialistName || "—"}
                            </td>
                            <td className="px-3 py-2.5 min-w-[120px] max-w-[220px]">
                              <span className="inline-flex items-start gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1 ${dotColor(e.type)}`} />
                                <span className={`${textColor} break-words`}>
                                  {e.title || "—"}
                                  {e.saleItems && e.saleItems.length > 1 && (
                                    <span className="ml-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium bg-emerald-50 text-emerald-600" title={e.saleItems.map(si => `${si.productName} ×${si.quantity}`).join(", ")}>
                                      {e.saleItems.length} тов.
                                    </span>
                                  )}
                                </span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                              {e.amount < 0 ? `−${Math.round(Math.abs(e.amount)).toLocaleString(locale)}` : Math.round(e.amount).toLocaleString(locale)}
                            </td>
                            <td className="px-3 py-2.5 text-left text-[11px] text-gray-500 max-w-[150px] truncate">
                              {e.comment || <span className="text-gray-300">—</span>}
                            </td>
                            {showDetailCols && (
                              <>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {e.supplement ? (
                                    <span className="text-gray-900">
                                      {e.supplement > 0 ? `+${e.supplement}` : e.supplement}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {e.baseMaterialsCost ? (
                                    <span className="text-purple-600">{Math.round(e.baseMaterialsCost).toLocaleString(locale)}</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {e.calculationCost ? (
                                    <span className="text-amber-600">{Math.round(e.calculationCost).toLocaleString(locale)}</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                                  {e.specialistShare ? Math.round(e.specialistShare).toLocaleString(locale) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                                  {(() => {
                                    const total = (e.salonShare || 0) + (e.salonMaterialShare || 0) + (e.salonSalesShare || 0);
                                    return total ? Math.round(total).toLocaleString(locale) : <span className="text-gray-300">—</span>;
                                  })()}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {e.source === "bot" ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-brand-50 text-brand-600">бот</span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500">адмін</span>
                                  )}
                                </td>
                              </>
                            )}
                            <td className="sticky right-0 z-10 bg-white px-2 py-2.5" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
