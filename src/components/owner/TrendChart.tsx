"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter } from "@/lib/format";

/**
 * Головний trend-chart owner-дашборду. День за днем за обраний період:
 *  - Оборот (сіра лінія)
 *  - Чистий (фіолетова)
 *  - Маржа % (жовта пунктирна, окрема вісь справа)
 *
 * Живе зверху в 8-col слоті, поруч із sidebar з касою/боргами. Це «вище
 * складки», щоб власник бачив трайекторію одразу після hero-чисел.
 */

interface Daily {
  date: string;
  revenue: number;
  net: number;
}

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
}

interface Props {
  daily: Daily[];
  current: Aggregates;
  previous: Aggregates;
  settings: Settings | null | undefined;
  loading: boolean;
  className?: string;
}

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export default function TrendChart({ daily, current, previous, settings, loading, className = "" }: Props) {
  const money = moneyFormatter(settings);
  const totalRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  const prevRevenue = previous.revenueServices + previous.revenueMaterials + previous.revenueSales;

  const chartData = useMemo(
    () => daily.map((d) => ({
      ...d,
      label: formatDateShort(d.date),
      margin: d.revenue > 0 ? (d.net / d.revenue) * 100 : 0,
    })),
    [daily],
  );

  return (
    <div className={`bg-white rounded-xl border border-black/[0.06] p-4 md:p-5 flex flex-col ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Динаміка за період</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Оборот · Чистий · Маржа день за днем
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      <div className="flex-1 min-h-[200px] -mx-2">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis
                tick={{ fontSize: 10, fill: "#9ca3af" }}
                tickLine={false}
                axisLine={false}
                width={40}
                tickFormatter={(v) => {
                  const n = Number(v) || 0;
                  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}k`;
                  return String(n);
                }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 10, fill: "#f59e0b" }}
                tickLine={false}
                axisLine={false}
                width={32}
                tickFormatter={(v) => `${Math.round(Number(v) || 0)}%`}
                domain={[0, 100]}
              />
              <Tooltip
                formatter={(value, name) => {
                  const num = Number(value) || 0;
                  if (name === "margin") return [`${num.toFixed(1)}%`, "Маржа"];
                  return [money(num), name === "revenue" ? "Оборот" : "Чистий"];
                }}
                labelFormatter={(l) => `Дата: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#9ca3af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="margin" yAxisId="pct" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-gray-400">
            Немає даних за період
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-gray-400" /> Оборот
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-[#8b5cf6]" /> Чистий дохід
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 border-t border-dashed" style={{ borderColor: "#f59e0b" }} /> Маржа %
        </span>
        <span className="sm:ml-auto text-gray-400 whitespace-nowrap">
          {money(prevRevenue)} → {money(totalRevenue)}
        </span>
      </div>
    </div>
  );
}
