"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";
import type { ServiceRow, ServiceTypeSlice } from "@/app/api/owner/stats/route";

interface Props {
  top: ServiceRow[];
  types: ServiceTypeSlice[];
  settings: Settings | null | undefined;
  loading: boolean;
}

const PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#3b82f6", "#ec4899", "#84cc16",
  "#f97316", "#14b8a6",
];

export default function ServicesBlock({ top, types, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const totalTypes = useMemo(() => types.reduce((s, t) => s + t.value, 0), [types]);
  const maxNet = useMemo(() => Math.max(...top.map((t) => t.netSalon), 1), [top]);

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-5 lg:col-span-2">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Послуги</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Топ-10 за чистим доходом · пиріг за видами
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {top.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Top-10 list */}
          <div className="lg:col-span-3 space-y-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">
              Топ послуг (за чистим доходом салону)
            </div>
            <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium pb-1.5 border-b border-black/[0.06]">
              <span className="w-5"></span>
              <div className="flex-1 flex items-center justify-between gap-2">
                <span>Послуга</span>
                <span className="text-gray-400">К-сть · оборот</span>
              </div>
              <span className="w-20 text-right">Чистий салону</span>
            </div>
            {top.map((s, i) => {
              const pct = (s.netSalon / maxNet) * 100;
              return (
                <div key={s.id} className="flex items-center gap-3 text-[12px]">
                  <span className="w-5 text-right text-gray-400 tabular-nums">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-900 truncate" title={s.name}>
                        {s.name}
                      </span>
                      <span className="text-gray-500 text-[11px] whitespace-nowrap">
                        {s.count} × · оборот {money(s.revenue)}
                      </span>
                    </div>
                    <div className="relative h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-500 rounded-full"
                        style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-900 font-semibold tabular-nums w-20 text-right">
                    {money(s.netSalon)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pie — service types */}
          <div className="lg:col-span-2">
            <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-1">
              Види послуг (за оборотом)
            </div>
            {types.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
                Немає даних
              </div>
            ) : (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={types}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="95%"
                        paddingAngle={2}
                        stroke="none"
                      >
                        {types.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [money(Number(value) || 0), "Оборот"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                  {types.map((t, i) => {
                    const pct = totalTypes > 0 ? (t.value / totalTypes) * 100 : 0;
                    return (
                      <div key={t.name} className="flex items-center gap-2 text-[11px]">
                        <span
                          className="w-2 h-2 rounded-sm shrink-0"
                          style={{ background: PALETTE[i % PALETTE.length] }}
                        />
                        <span className="text-gray-700 truncate flex-1" title={t.name}>
                          {t.name}
                        </span>
                        <span className="text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                        <span className="text-gray-900 tabular-nums w-16 text-right">{money(t.value)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
