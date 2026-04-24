"use client";

import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter } from "@/lib/format";

/**
 * Hero-стрічка KPI зверху owner-дашборду. 5 головних чисел, які власник
 * хоче бачити одразу як зайшов:
 *   Оборот · Чистий · Каса · Середній чек · Маржа
 *
 * Під кожним (окрім каси) — дельта vs попередній період. Каса lifetime —
 * замість дельти показуємо breakdown 💵/💳. Це «температура бізнесу» на
 * один погляд; решта дошки — деталізація.
 *
 * Ідіома: grid-cols-2 → md:3 → lg:5, щоб на мобільному картки були 2×3,
 * на планшеті 3+2, на десктопі — один рядок з п'яти.
 */

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
  netSalon: number;
  expensesTotal: number;
  margin: number;
  countRevenue: number;
}

interface Balances {
  cashTotal: number;
  cashByMethod: { cash: number; card: number; unknown: number };
}

interface Props {
  current: Aggregates;
  previous: Aggregates;
  balances: Balances | null;
  settings: Settings | null | undefined;
  loading: boolean;
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-[10px] text-gray-300">—</span>;
  const neutral = Math.abs(pct) < 0.5;
  const positive = pct >= 0;
  const color = neutral
    ? "text-gray-400"
    : positive
      ? "text-emerald-600"
      : "text-rose-500";
  const arrow = neutral ? "→" : positive ? "↑" : "↓";
  return (
    <span className={`text-[11px] font-medium tabular-nums ${color}`}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function MetricCard({
  label,
  value,
  sub,
  delta,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  delta?: number | null;
  accent?: "brand" | "emerald" | "default";
  loading?: boolean;
}) {
  const accentCls =
    accent === "brand"
      ? "border-brand-100 bg-gradient-to-br from-brand-50/60 to-white"
      : accent === "emerald"
        ? "border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white"
        : "border-black/[0.06] bg-white";
  const labelCls =
    accent === "brand"
      ? "text-brand-600"
      : accent === "emerald"
        ? "text-emerald-600"
        : "text-gray-400";
  return (
    <div className={`rounded-xl border ${accentCls} px-4 py-3 flex flex-col min-w-0`}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className={`text-[10px] uppercase tracking-wider font-semibold truncate ${labelCls}`}>
          {label}
        </div>
        {delta !== undefined && <Delta pct={delta ?? null} />}
      </div>
      <div className={`text-[20px] font-semibold text-gray-900 tabular-nums leading-tight ${loading ? "opacity-40" : ""}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-gray-500 tabular-nums truncate">{sub}</div>}
    </div>
  );
}

export default function HeroMetrics({ current, previous, balances, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const totalRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  const prevRevenue = previous.revenueServices + previous.revenueMaterials + previous.revenueSales;

  const netProfit = current.netSalon;
  const prevNet = previous.netSalon;

  const avgCheck = current.countRevenue > 0 ? totalRevenue / current.countRevenue : 0;
  const avgCheckPrev = previous.countRevenue > 0 ? prevRevenue / previous.countRevenue : 0;

  const marginPct = current.margin * 100;
  const marginPctPrev = previous.margin * 100;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
      <MetricCard
        label="Оборот"
        value={money(Math.round(totalRevenue))}
        delta={deltaPct(totalRevenue, prevRevenue)}
        sub={`${current.countRevenue} візитів`}
        loading={loading}
      />
      <MetricCard
        label="Чистий"
        value={money(Math.round(netProfit))}
        delta={deltaPct(netProfit, prevNet)}
        accent="emerald"
        loading={loading}
      />
      <MetricCard
        label="Каса"
        value={balances ? money(Math.round(balances.cashTotal)) : "—"}
        accent="brand"
        sub={balances ? (
          <>
            💵 {money(Math.round(balances.cashByMethod.cash))}
            <span className="text-gray-300 mx-1.5">·</span>
            💳 {money(Math.round(balances.cashByMethod.card))}
          </>
        ) : null}
      />
      <MetricCard
        label="Середній чек"
        value={money(Math.round(avgCheck))}
        delta={deltaPct(avgCheck, avgCheckPrev)}
        loading={loading}
      />
      <MetricCard
        label="Маржа"
        value={`${marginPct.toFixed(1)}%`}
        delta={deltaPct(marginPct, marginPctPrev)}
        loading={loading}
      />
    </div>
  );
}
