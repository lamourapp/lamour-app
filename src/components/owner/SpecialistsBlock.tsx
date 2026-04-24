"use client";

import { useMemo, useState } from "react";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";
import type { SpecialistRow } from "@/app/api/owner/stats/route";

interface Props {
  data: SpecialistRow[];
  settings: Settings | null | undefined;
  loading: boolean;
}

// Розширений рядок з обчисленим повним оборотом (послуги-робота + товари-gross).
// Виносимо в окремий тип, щоб sort/render не плутались з SpecialistRow.
type EnrichedRow = SpecialistRow & { revenueTotal: number };

type SortKey = keyof Pick<
  EnrichedRow,
  "name" | "count" | "revenueTotal" | "masterPay" | "netSalon"
>;

const COLUMNS: { key: SortKey; label: string; numeric: boolean; tooltip?: string }[] = [
  { key: "name", label: "Майстер", numeric: false },
  { key: "count", label: "К-сть", numeric: true },
  {
    key: "revenueTotal",
    label: "Оборот",
    numeric: true,
    tooltip: "Послуги (робота, без матеріалів) + товари (gross). Повний потік грошей через майстра.",
  },
  { key: "masterPay", label: "Майстру", numeric: true },
  { key: "netSalon", label: "Чистий салону", numeric: true },
];

/**
 * Таблиця майстрів. Попередня версія мала окремий bar-chart зліва, який
 * дублював таблицю — на 6-col ширині обидві частини виходили затиснуті.
 * Тепер: bar-fill інлайном у колонці «Чистий салону» (background row). За
 * один погляд видно і число, і відносну магнітуду.
 *
 * Колонки скоротив з 7 до 5 суттєвих (netMaterials/netSales — тонкий шум,
 * доступні в деталях на хові: рендеримо tooltip на останню колонку).
 */
export default function SpecialistsBlock({ data, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const [sortKey, setSortKey] = useState<SortKey>("netSalon");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Збагачуємо рядки повним оборотом = робота-без-матеріалів + товари-gross.
  // Це дає очікуваний інваріант: revenueTotal ≥ masterPay ≥ netSalon (усе
  // що пройшло ≥ виплачено майстру ≥ лишилося салону), без візуальних
  // парадоксів, які виникали коли «Оборот» = тільки revenueServices.
  const enriched: EnrichedRow[] = useMemo(
    () => data.map((d) => ({ ...d, revenueTotal: d.revenueServices + d.revenueSales })),
    [data],
  );

  const sorted = useMemo(() => {
    const copy = enriched.slice();
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "uk");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [enriched, sortKey, sortDir]);

  const maxNet = useMemo(
    () => Math.max(...data.map((d) => Math.abs(d.netSalon)), 1),
    [data],
  );

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Майстри</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Порівняння за внеском у чистий дохід салону
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
        <>
          {/* Mobile: картки (таблиця з 5 колонок на 360px нечитна) */}
          <div className="lg:hidden space-y-2">
            {sorted.map((s) => {
              const pct = (s.netSalon / maxNet) * 100;
              return (
                <div key={s.id} className="bg-gray-50/60 rounded-lg px-3 py-2.5 border border-black/[0.04] relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-violet-100/60 pointer-events-none"
                    style={{ width: `${Math.max(0, pct)}%` }}
                  />
                  <div className="relative">
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <div className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</div>
                      <div className="text-[11px] text-gray-400 shrink-0">{s.count} зап.</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <div>
                        <div className="text-gray-400 text-[10px] uppercase tracking-wider">Оборот</div>
                        <div className="text-gray-900 font-medium tabular-nums">{money(s.revenueTotal)}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-[10px] uppercase tracking-wider">Майстру</div>
                        <div className="text-gray-900 font-medium tabular-nums">{money(s.masterPay)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-400 text-[10px] uppercase tracking-wider">Салону</div>
                        <div className="text-gray-900 font-semibold tabular-nums">{money(s.netSalon)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: таблиця з inline bar-fill у рядках */}
          <div className="hidden lg:block">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-black/5 text-gray-400">
                  {COLUMNS.map((c) => {
                    const active = c.key === sortKey;
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
                        title={c.tooltip}
                        className={`py-2 px-2 font-medium cursor-pointer select-none whitespace-nowrap ${
                          c.numeric ? "text-right" : "text-left"
                        } ${active ? "text-gray-900" : "hover:text-gray-700"}`}
                      >
                        {c.label}
                        {active && <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => {
                  const pct = Math.max(0, (s.netSalon / maxNet) * 100);
                  const tooltip = `Робота: ${money(s.revenueServices)} · Товари: ${money(s.revenueSales)} · Чистий матеріали: ${money(s.netMaterials)} · Чистий продажі: ${money(s.netSales)}`;
                  return (
                    <tr key={s.id} className="border-b border-black/[0.03] last:border-0 relative">
                      <td className="py-2 px-2 text-gray-900 font-medium whitespace-nowrap">{s.name}</td>
                      <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{s.count}</td>
                      <td className="py-2 px-2 text-right text-gray-700 tabular-nums" title={`Робота ${money(s.revenueServices)} + товари ${money(s.revenueSales)}`}>{money(s.revenueTotal)}</td>
                      <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{money(s.masterPay)}</td>
                      <td className="py-2 px-2 text-right relative" title={tooltip}>
                        {/* inline bar-fill під числом */}
                        <div className="absolute inset-y-1 right-2 left-2 bg-gray-100 rounded-sm overflow-hidden pointer-events-none">
                          <div
                            className="h-full bg-violet-200/70"
                            style={{ width: `${pct}%`, marginLeft: "auto" }}
                          />
                        </div>
                        <span className="relative text-gray-900 font-semibold tabular-nums">
                          {money(s.netSalon)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
