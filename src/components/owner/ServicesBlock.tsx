"use client";

import { useMemo } from "react";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";
import type { ServiceRow } from "@/app/api/owner/stats/route";

interface Props {
  top: ServiceRow[];
  settings: Settings | null | undefined;
  loading: boolean;
}

const PALETTE = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444",
  "#10b981", "#3b82f6", "#ec4899", "#84cc16",
  "#f97316", "#14b8a6",
];

/**
 * Топ-10 послуг за чистим доходом салону. Однотипний до ProductsBlock
 * layout: №, назва+bar, к-ть·оборот, значення. Overview-стрічка «види
 * послуг» винесена в окремий блок ServiceTypesBlock нижче.
 */
export default function ServicesBlock({ top, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const maxNet = useMemo(() => Math.max(...top.map((t) => t.netSalon), 1), [top]);

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Послуги</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">Топ-10 за чистим доходом салону</p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {top.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-[11px] text-gray-400">
          Немає даних за період
        </div>
      ) : (
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
            const pct = Math.max(0, (s.netSalon / maxNet) * 100);
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
      )}
    </div>
  );
}
