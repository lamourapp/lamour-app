"use client";

import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";
import type { SpecialistRow } from "@/app/api/owner/stats/route";

interface Props {
  data: SpecialistRow[];
  settings: Settings | null | undefined;
  loading: boolean;
}

type SortKey = keyof Pick<
  SpecialistRow,
  "name" | "count" | "revenueServices" | "netMaterials" | "netSales" | "masterPay" | "netSalon"
>;

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Майстер", numeric: false },
  { key: "count", label: "К-сть", numeric: true },
  { key: "revenueServices", label: "Оборот послуг", numeric: true },
  { key: "netMaterials", label: "Чистий матеріали", numeric: true },
  { key: "netSales", label: "Чистий продажі", numeric: true },
  { key: "masterPay", label: "Оплата майстру", numeric: true },
  { key: "netSalon", label: "Чистий дохід салону", numeric: true },
];

const BAR_COLOR = "#8b5cf6";

export default function SpecialistsBlock({ data, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const [sortKey, setSortKey] = useState<SortKey>("netSalon");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const copy = data.slice();
    copy.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "uk");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir]);

  const top5 = useMemo(
    () =>
      data
        .slice()
        .sort((a, b) => b.netSalon - a.netSalon)
        .slice(0, 5)
        .map((s) => ({ name: s.name, value: s.netSalon })),
    [data],
  );

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5 lg:col-span-2">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Майстри</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Порівняльна таблиця · топ-5 за чистим доходом салону
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Bar chart — top 5 */}
          <div className="lg:col-span-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#374151" }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [money(Number(value) || 0), "Чистий дохід салону"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
                  cursor={{ fill: "rgba(139,92,246,0.06)" }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {top5.map((_, i) => (
                    <Cell key={i} fill={BAR_COLOR} fillOpacity={1 - i * 0.12} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Mobile: card layout per master. Таблиця з 7 колонок нечитна
              на 360px — замість скролу даємо вертикальний стек карток
              із ключовими цифрами (Оборот послуг, Оплата майстру, Чистий салону). */}
          <div className="lg:hidden space-y-2">
            {sorted.map((s) => (
              <div key={s.id} className="bg-gray-50/60 rounded-lg px-3 py-2.5 border border-black/[0.04]">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</div>
                  <div className="text-[11px] text-gray-400 shrink-0">{s.count} зап.</div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div>
                    <div className="text-gray-400 text-[10px] uppercase tracking-wider">Оборот</div>
                    <div className="text-gray-900 font-medium tabular-nums">{money(s.revenueServices)}</div>
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
                {(s.netMaterials !== 0 || s.netSales !== 0) && (
                  <div className="flex gap-3 mt-1.5 pt-1.5 border-t border-black/[0.04] text-[11px] text-gray-500">
                    {s.netMaterials !== 0 && (
                      <span>матеріали <span className="text-gray-700 tabular-nums">{money(s.netMaterials)}</span></span>
                    )}
                    {s.netSales !== 0 && (
                      <span>продажі <span className="text-gray-700 tabular-nums">{money(s.netSales)}</span></span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Sortable table — тільки на lg+ (потрібно ≥5 колонок простору) */}
          <div className="hidden lg:block lg:col-span-3 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-black/5 text-gray-400">
                  {COLUMNS.map((c) => {
                    const active = c.key === sortKey;
                    return (
                      <th
                        key={c.key}
                        onClick={() => toggleSort(c.key)}
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
                {sorted.map((s) => (
                  <tr key={s.id} className="border-b border-black/[0.03] last:border-0">
                    <td className="py-2 px-2 text-gray-900 font-medium whitespace-nowrap">{s.name}</td>
                    <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{s.count}</td>
                    <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{money(s.revenueServices)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{money(s.netMaterials)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{money(s.netSales)}</td>
                    <td className="py-2 px-2 text-right text-gray-700 tabular-nums">{money(s.masterPay)}</td>
                    <td className="py-2 px-2 text-right text-gray-900 font-semibold tabular-nums">{money(s.netSalon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
