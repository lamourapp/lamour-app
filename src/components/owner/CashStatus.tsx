"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter, todayISO } from "@/lib/format";

/**
 * Operational-картка «Залишок у касах» (lifetime). Живе у sidebar 4-col на
 * owner-дашборді поруч із головним trend-chart. 3 рівні інформації:
 *  1) Загальна сума + breakdown 💵/💳 — STAN.
 *  2) Sparkline балансу за 30 днів — тренд STAN.
 *  3) Дельта за 30 днів (+/− ₴) — напрямок руху.
 *
 * НЕ залежить від period-filter (це lifetime). Flow за обраний період
 * живе окремо у P&L/графіку трендів.
 */

interface Balances {
  cashTotal: number;
  cashByMethod: { cash: number; card: number; unknown: number };
}

interface Props {
  balances: Balances | null;
  settings: Settings | null | undefined;
  className?: string;
}

export default function CashStatus({ balances, settings, className = "" }: Props) {
  const money = moneyFormatter(settings);

  const [history, setHistory] = useState<{ date: string; balance: number }[]>([]);
  const [delta, setDelta] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // `today` з локалі юзера — щоб останній бар на sparkline був «сьогодні»
    // у його часовому поясі, а не UTC-сьогодні (Vercel рантайм у UTC).
    fetch(`/api/owner/cash-history?days=30&today=${todayISO()}`)
      .then((r) => r.json())
      .then((d: { history?: { date: string; balance: number }[]; delta?: number | null }) => {
        if (cancelled) return;
        if (Array.isArray(d.history)) setHistory(d.history);
        if (typeof d.delta === "number" || d.delta === null) setDelta(d.delta ?? null);
      })
      .catch(() => { /* silent — sparkline optional */ });
    return () => { cancelled = true; };
  }, []);

  if (!balances) return null;

  return (
    <div className={`rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-white px-4 py-3 ${className}`}>
      <div className="flex items-baseline justify-between mb-2 gap-3">
        <div className="text-[10px] text-brand-600 uppercase tracking-wider font-semibold">
          Залишок у касах
        </div>
        <div className="text-[18px] font-semibold text-gray-900 tabular-nums">
          {money(Math.round(balances.cashTotal))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-gray-500">💵 Готівка:</span>
          <span className="text-gray-900 font-medium">{money(Math.round(balances.cashByMethod.cash))}</span>
        </span>
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-gray-500">💳 Карта:</span>
          <span className="text-gray-900 font-medium">{money(Math.round(balances.cashByMethod.card))}</span>
        </span>
        {Math.abs(balances.cashByMethod.unknown) > 0.5 && (
          <span className="inline-flex items-baseline gap-1.5 text-gray-400" title="Історичні записи без вказаної каси">
            <span>? Без каси:</span>
            <span className="font-medium">{money(Math.round(balances.cashByMethod.unknown))}</span>
          </span>
        )}
      </div>
      {history.length >= 2 && (
        <div className="mt-3 pt-2.5 border-t border-brand-100/70">
          <div className="flex items-baseline justify-between mb-1">
            <div className="text-[10px] text-brand-600/80 uppercase tracking-wider font-semibold">
              Тренд · 30 днів
            </div>
            {delta !== null && (
              <div className={`text-[11px] tabular-nums font-medium ${
                Math.abs(delta) < 1 ? "text-gray-400"
                  : delta > 0 ? "text-emerald-600"
                  : "text-rose-500"
              }`}>
                {Math.abs(delta) < 1 ? "→" : delta > 0 ? "↑" : "↓"}{" "}
                {delta > 0 ? "+" : ""}{money(Math.round(delta))}
              </div>
            )}
          </div>
          <div className="h-[56px] -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  formatter={(v) => [money(Math.round(Number(v) || 0)), "залишок"]}
                  labelFormatter={(d) => String(d).split("-").reverse().join(".")}
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.06)",
                    padding: "4px 8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#10b981"
                  strokeWidth={1.75}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
