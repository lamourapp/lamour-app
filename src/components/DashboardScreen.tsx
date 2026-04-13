"use client";

import { useState } from "react";
import { dashboardMetrics, journalEntries } from "@/lib/demo-data";

function MetricCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number | string;
  variant?: "default" | "brand-accent" | "brand-light" | "brand-dark";
}) {
  const styles = {
    default: {
      card: "bg-white border-black/[0.06]",
      label: "text-gray-400",
      value: "text-gray-900",
    },
    "brand-accent": {
      card: "bg-brand-600 border-brand-600",
      label: "text-brand-200",
      value: "text-white",
    },
    "brand-light": {
      card: "border-brand-200 bg-brand-50",
      label: "text-brand-600",
      value: "text-brand-700",
    },
    "brand-dark": {
      card: "border-brand-100 bg-brand-50/50",
      label: "text-brand-500",
      value: "text-brand-700",
    },
  };
  const s = styles[variant];

  return (
    <div className={`rounded-xl border p-3.5 transition-transform hover:-translate-y-px ${s.card}`}>
      <div className={`text-[10px] uppercase tracking-wider mb-1.5 ${s.label}`}>{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${s.value}`}>
        {typeof value === "number" ? value.toLocaleString("uk-UA") : value}
      </div>
    </div>
  );
}

export default function DashboardScreen() {
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const m = dashboardMetrics;

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-3 mb-5">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-1">
            {["День", "Тиждень", "Місяць", "Рік", "📅"].map((label, i) => (
              <button
                key={label}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                  ${i === 2 ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-black/5 hidden sm:block" />
          <select className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer">
            <option>Всі спеціалісти</option>
          </select>
          <select className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer">
            <option>Всі послуги</option>
          </select>
        </div>
      </div>

      {/* Admin metrics */}
      <div className="mb-6">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3 px-0.5">
          Показники · квітень 2026
        </div>

        {/* Row 1: salon share */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <MetricCard label="% салону / послуги" value={m.salonServiceShare} />
          <MetricCard label="% салону / матеріали" value={m.salonMaterialShare} />
          <MetricCard label="% салону / продажі" value={m.salonSalesShare} />
          <MetricCard label="Всього салону" value={m.salonTotal} variant="brand-accent" />
        </div>

        {/* Row 2: specialist share */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
          <MetricCard label="% спеціалісту / послуги" value={m.specialistServiceShare} />
          <MetricCard label="% спеціалісту / матеріали" value={m.specialistMaterialShare} />
          <MetricCard label="% спеціалісту / продажі" value={m.specialistSalesShare} />
          <MetricCard label="Всього спеціалісту" value={m.specialistTotal} variant="brand-light" />
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="sm:col-start-2">
            <MetricCard label="Борги" value={m.debts} />
          </div>
          <MetricCard label="Витрати" value={m.expenses} />
          <MetricCard label="Кошти в касі" value={m.cashInRegister} variant="brand-accent" />
        </div>
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
          <div className="text-[10px] font-semibold text-brand-600 uppercase tracking-widest mb-3 px-0.5">
            🔓 Аналітика власника
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricCard label="Чистий дохід" value={m.netIncome} variant="brand-dark" />
            <MetricCard label="Маржа матеріали" value={m.materialMargin} />
            <MetricCard label="Прибуток продажі" value={m.salesProfit} />
            <MetricCard label="Собівартість" value="—" />
          </div>
        </div>
      )}

      {/* Journal table */}
      <div>
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
            Журнал за період
          </div>
          <span className="text-[11px] text-gray-400">{journalEntries.length} записів</span>
        </div>

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
                  {["Вартість", "Допов.", "% спец.", "% салону"].map((h) => (
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
                {journalEntries.map((e) => {
                  const dotColor = e.type === "expense" ? "bg-gray-300" : e.type === "rental" ? "bg-amber-400" : "bg-brand-400";
                  const textColor = e.type === "expense" ? "text-gray-500" : "text-gray-700";
                  const dateStr = new Date(e.date).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });

                  return (
                    <tr key={e.id} className="border-b border-black/[0.03] hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap tabular-nums">{dateStr}</td>
                      <td className={`px-3 py-2.5 whitespace-nowrap font-medium ${e.specialistName ? "text-gray-900" : "text-gray-400"}`}>
                        {e.specialistName || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                          <span className={textColor}>{e.title}</span>
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
                      <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                        {e.specialistShare ? e.specialistShare.toLocaleString("uk-UA") : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500 tabular-nums">
                        {e.salonShare ? e.salonShare.toLocaleString("uk-UA") : <span className="text-gray-300">—</span>}
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
      </div>
    </div>
  );
}
