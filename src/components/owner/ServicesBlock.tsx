"use client";

import { useMemo } from "react";
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

/**
 * Послуги: overview + detail. Попередня версія мала pie-chart справа, який
 * дублював список кольорів у легенді — на 6-col ширині і список, і пиріг
 * виходили затиснуті. Тепер:
 *
 *  - Зверху: stacked horizontal bar по типах (компактна 100%-стрічка з
 *    inline-підписами внизу). Замість пирога — лаконічніше й читабельніше.
 *  - Під нею: повна ширина для top-10 списку з inline bar-fills.
 */
export default function ServicesBlock({ top, types, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const totalTypes = useMemo(() => types.reduce((s, t) => s + t.value, 0), [types]);
  const maxNet = useMemo(() => Math.max(...top.map((t) => t.netSalon), 1), [top]);

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Послуги</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Види послуг + топ-10 за чистим доходом салону
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {top.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
        <>
          {/* Overview: stacked 100% bar по типах — компактна одна стрічка,
              з легендою-чіпами знизу. Замість pie chart. */}
          {types.length > 0 && totalTypes > 0 && (
            <div className="mb-4">
              <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">
                Види послуг · {money(Math.round(totalTypes))} оборот
              </div>
              <div className="flex w-full h-2.5 rounded-full overflow-hidden bg-gray-100">
                {types.map((t, i) => {
                  const pct = (t.value / totalTypes) * 100;
                  return (
                    <div
                      key={t.name}
                      style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                      title={`${t.name}: ${pct.toFixed(1)}% · ${money(t.value)}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
                {types.map((t, i) => {
                  const pct = (t.value / totalTypes) * 100;
                  return (
                    <span key={t.name} className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      <span className="text-gray-700 truncate max-w-[140px]" title={t.name}>{t.name}</span>
                      <span className="text-gray-400 tabular-nums">{pct.toFixed(1)}%</span>
                      <span className="text-gray-500 tabular-nums">· {money(t.value)}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detail: top-10 список, повна ширина блоку */}
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium pb-1.5 border-b border-black/[0.06]">
              <span className="w-5">#</span>
              <div className="flex-1 flex items-center justify-between gap-2">
                <span>Послуга</span>
                <span className="text-gray-400">К-сть · оборот</span>
              </div>
              <span className="w-24 text-right">Чистий салону</span>
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
                        {s.count} × · {money(s.revenue)}
                      </span>
                    </div>
                    <div className="relative h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-900 font-semibold tabular-nums w-24 text-right">
                    {money(s.netSalon)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
