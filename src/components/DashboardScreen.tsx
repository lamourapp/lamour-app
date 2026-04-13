"use client";

import { useState, useMemo } from "react";
import { useJournal, useSpecialists } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/demo-data";
import CalendarPicker from "./CalendarPicker";

function MetricCard({
  label,
  sublabel,
  value,
  suffix = "₴",
  variant = "default",
}: {
  label: string;
  sublabel?: string;
  value: number | string;
  suffix?: string;
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
      ? `${value.toLocaleString("uk-UA")}${suffix ? ` ${suffix}` : ""}`
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
  const [period, setPeriod] = useState("month");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

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
      <div className="bg-white rounded-xl border border-black/[0.06] p-3 mb-5">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-1">
            {periodButtons.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPeriod(p.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                  ${period === p.id && !customRange ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                ${customRange ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
            >
              📅
            </button>
          </div>
          <div className="h-5 w-px bg-black/5 hidden sm:block" />
          <select
            value={selectedSpecialist}
            onChange={(e) => setSelectedSpecialist(e.target.value)}
            className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer"
          >
            <option value="">Всі спеціалісти</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
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
              <MetricCard label="% салону за послуги" value={Math.round(m.salonServiceShare)} />
              <MetricCard label="% салону за матеріали" value={Math.round(m.salonMaterialShare)} />
              <MetricCard label="% салону за продажі" value={Math.round(m.salonSalesShare)} />
              <MetricCard label="Всього салону" value={Math.round(m.salonTotal)} variant="green" />
            </div>

            {/* Row 2: specialist share */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
              <MetricCard label="% спеціалісту за послуги" value={Math.round(m.specialistServiceShare)} />
              <MetricCard label="% спеціалісту за матеріали" value={Math.round(m.specialistMaterialShare)} />
              <MetricCard label="% спеціалісту за продажі" value={Math.round(m.specialistSalesShare)} />
              <MetricCard label="Всього оплата спеціалісту" value={Math.round(m.specialistTotal)} variant="green-light" />
            </div>

            {/* Row 3: debts, expenses, rental, cash */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MetricCard
                label="Борги"
                sublabel={totalDebt > 0 ? "салон винен · актуально" : totalDebt < 0 ? "нам винні · актуально" : "баланс · актуально"}
                value={Math.round(totalDebt)}
                variant={totalDebt !== 0 ? "negative" : "default"}
              />
              <MetricCard label="Витрати" value={Math.round(m.expenses)} />
              <MetricCard label="Оренда" sublabel="без матеріалів" value={Math.round(m.rentalSum)} />
              <MetricCard label="Кошти в касі" value={Math.round(m.cashInRegister)} />
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
                  variant="brand-dark"
                />
                <MetricCard label="Чистий дохід салону" value={Math.round(m.cashInRegister)} variant="brand-dark" />
                <MetricCard
                  label="Середній чек послуги"
                  value={m.countServices > 0 ? Math.round((m.salonServiceShare + m.specialistServiceShare) / m.countServices) : 0}
                />
                <MetricCard
                  label="Середній чек продажу"
                  value={m.countSales > 0 ? Math.round((m.salonSalesShare + m.specialistSalesShare) / m.countSales) : 0}
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
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-black/5">
                        {["Дата", "Спеціаліст", "Послуга / продаж"].map((h) => (
                          <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                        {["Вартість", "Допов.", "Калькул.", "Матер.", "% спец.", "% салону"].map((h) => (
                          <th key={h} className="text-right px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                        <th className="text-center px-3 py-2.5 font-medium text-gray-400 whitespace-nowrap text-[10px] uppercase tracking-wider">
                          Автор
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => {
                        const textColor = e.type === "expense" ? "text-gray-500" : "text-gray-700";
                        const dateStr = new Date(e.date + "T00:00:00").toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

                        return (
                          <tr key={e.id} className="border-b border-black/[0.03] hover:bg-gray-50/50">
                            <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap tabular-nums">{dateStr}</td>
                            <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${e.specialistName ? "text-gray-900" : "text-gray-400"}`}>
                              {e.specialistName || "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${dotColor(e.type)}`} />
                                <span className={textColor}>{e.title || "—"}</span>
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                              {e.amount < 0 ? `−${Math.abs(e.amount).toLocaleString("uk-UA")}` : e.amount.toLocaleString("uk-UA")}
                            </td>
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
                              {e.calculationCost ? (
                                <span className="text-purple-600">{e.calculationCost.toLocaleString("uk-UA")}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {e.baseMaterialsCost ? (
                                <span className="text-amber-600">{e.baseMaterialsCost.toLocaleString("uk-UA")}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                              {e.specialistShare ? e.specialistShare.toLocaleString("uk-UA") : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                              {(() => {
                                const total = (e.salonShare || 0) + (e.salonMaterialShare || 0) + (e.salonSalesShare || 0);
                                return total ? total.toLocaleString("uk-UA") : <span className="text-gray-300">—</span>;
                              })()}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              {e.source === "bot" ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-brand-50 text-brand-600">бот</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-500">адмін</span>
                              )}
                            </td>
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
