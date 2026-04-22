"use client";

import { useMemo, useState } from "react";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";

interface Props {
  data: { name: string; value: number }[];
  total: number;
  settings: Settings | null | undefined;
  loading: boolean;
}

// Відповідає палітрі ProductsBlock — консистентний візуал між блоками.
const PALETTE = [
  "#ec4899", "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#84cc16", "#f97316", "#14b8a6",
];

const INITIAL_LIMIT = 5; // решта ховається під «Показати всі»

/**
 * Витрати по категоріях у вигляді horizontal bars.
 *
 * Раніше тут був pie + legend — неузгоджено з ProductsBlock і важко читати
 * на мобільному (дрібний pie, довгі підписи категорій). Bars з width =
 * частка від максимуму дають однакову ментальну модель що й топ продажів:
 * довший — більше з'їло.
 */
export default function ExpensesBlock({ data, total, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const sorted = useMemo(() => data.slice().sort((a, b) => b.value - a.value), [data]);
  const maxValue = useMemo(() => Math.max(...sorted.map((d) => d.value), 1), [sorted]);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);
  const hiddenCount = sorted.length - INITIAL_LIMIT;

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
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
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium pb-1.5 border-b border-black/[0.06]">
            <span className="w-5"></span>
            <span className="flex-1">Категорія</span>
            <span className="w-12 text-right text-gray-400">%</span>
            <span className="w-20 text-right">Сума</span>
          </div>
          {visible.map((item, i) => {
            const pct = total > 0 ? (item.value / total) * 100 : 0;
            const barPct = (item.value / maxValue) * 100;
            return (
              <div key={item.name} className="flex items-center gap-3 text-[12px]">
                <span className="w-5 text-right text-gray-400 tabular-nums">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-900 truncate" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <div className="relative h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${barPct}%`, background: PALETTE[i % PALETTE.length] }}
                    />
                  </div>
                </div>
                <span className="w-12 text-right text-gray-400 text-[11px] tabular-nums">
                  {pct.toFixed(1)}%
                </span>
                <span className="text-gray-900 font-semibold tabular-nums w-20 text-right">
                  {money(item.value)}
                </span>
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-center pt-2 text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            >
              {showAll ? "Сховати" : `Показати ще ${hiddenCount}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
