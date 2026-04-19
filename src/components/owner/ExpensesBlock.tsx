"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";

interface Props {
  data: { name: string; value: number }[];
  total: number;
  settings: Settings | null | undefined;
  loading: boolean;
}

// Pleasant palette that tolerates arbitrary category count.
const PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#3b82f6", "#ec4899", "#84cc16",
  "#f97316", "#14b8a6", "#a855f7", "#eab308",
  "#6366f1", "#22c55e", "#0ea5e9",
];

export default function ExpensesBlock({ data, total, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const sorted = useMemo(() => data.slice().sort((a, b) => b.value - a.value), [data]);

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Витрати</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            За категоріями · всього {money(total)}
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {sorted.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає витрат за період
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sorted}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="95%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {sorted.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [money(Number(value) || 0), "Сума"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {sorted.map((item, i) => {
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.name} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  <span className="text-gray-700 truncate flex-1" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-gray-400 text-[11px] tabular-nums">{pct.toFixed(1)}%</span>
                  <span className="text-gray-900 tabular-nums w-20 text-right">{money(item.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
