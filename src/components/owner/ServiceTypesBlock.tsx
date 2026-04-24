"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";
import type { ServiceTypeSlice } from "@/app/api/owner/stats/route";

interface Props {
  types: ServiceTypeSlice[];
  settings: Settings | null | undefined;
  loading: boolean;
}

const PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#3b82f6", "#ec4899", "#84cc16",
  "#f97316", "#14b8a6",
];

/**
 * Види послуг: розподіл обороту за категоріями. Зліва — список (назва,
 * сума, %), справа — pie-chart. Повна ширина, щоб pie не був мікро-
 * іконкою та список мав місце для довгих назв категорій.
 */
export default function ServiceTypesBlock({ types, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const total = useMemo(() => types.reduce((s, t) => s + t.value, 0), [types]);

  const sorted = useMemo(
    () => types.slice().sort((a, b) => b.value - a.value),
    [types],
  );

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Види послуг</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Розподіл обороту по категоріях</p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {sorted.length === 0 || total <= 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* Список */}
          <div className="space-y-1.5">
            {sorted.map((t, i) => {
              const pct = (t.value / total) * 100;
              const color = PALETTE[i % PALETTE.length];
              return (
                <div key={t.name} className="flex items-center gap-2.5 text-[12px]">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-gray-900 truncate flex-1" title={t.name}>
                    {t.name}
                  </span>
                  <span className="text-gray-500 tabular-nums whitespace-nowrap text-[11px]">
                    {money(t.value)}
                  </span>
                  <span className="w-12 text-right text-gray-900 font-semibold tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pie */}
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="55%"
                  outerRadius="95%"
                  paddingAngle={1}
                  stroke="none"
                >
                  {sorted.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => {
                    const num = Number(value) || 0;
                    const pct = total > 0 ? (num / total) * 100 : 0;
                    return [`${money(num)} · ${pct.toFixed(1)}%`, name];
                  }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
