"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { moneyFormatter } from "@/lib/format";
import type { Settings } from "@/app/api/settings/route";

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
  netMaterials: number;
  netSales: number;
  netSalon: number;
  masterPay: number;
  expensesTotal: number;
  margin: number;
  count: number;
}

interface Props {
  current: Aggregates;
  previous: Aggregates;
  daily: { date: string; revenue: number; net: number }[];
  settings: Settings | null | undefined;
  loading: boolean;
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-[10px] text-gray-400">—</span>;
  }
  const positive = delta >= 0;
  const neutral = Math.abs(delta) < 0.5;
  const color = neutral
    ? "text-gray-400"
    : positive
      ? "text-emerald-600"
      : "text-rose-500";
  const arrow = neutral ? "→" : positive ? "↑" : "↓";
  return (
    <span className={`text-[10px] font-medium ${color}`}>
      {arrow} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  prev,
  hint,
  net,
  money,
}: {
  label: string;
  value: number;
  prev: number;
  hint?: string;
  net?: number;
  money: (n: number) => string;
  settings?: Settings | null;
}) {
  const delta = useMemo(() => deltaPct(value, prev), [value, prev]);
  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-black/[0.04]">
      <div className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-[18px] font-semibold text-gray-900 mt-1 tabular-nums">{money(value)}</div>
      {net !== undefined && (
        <div className="text-[11px] text-emerald-600 tabular-nums mt-0.5">
          чистий {money(net)}
        </div>
      )}
      <div className="flex items-center justify-between mt-1">
        <DeltaBadge delta={delta} />
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export default function FinancialBlock({ current, previous, daily, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const totalRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  const prevRevenue = previous.revenueServices + previous.revenueMaterials + previous.revenueSales;

  const chartData = useMemo(
    () => daily.map((d) => ({ ...d, label: formatDateShort(d.date) })),
    [daily],
  );

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-5 lg:col-span-2">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Фінансовий зріз</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Оборот · чистий дохід · маржинальність · динаміка
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
        <KpiCard label="Оборот послуг" value={current.revenueServices} prev={previous.revenueServices} money={money} settings={settings} />
        <KpiCard label="Оборот матеріалів" value={current.revenueMaterials} prev={previous.revenueMaterials} net={current.netMaterials} money={money} settings={settings} />
        <KpiCard label="Оборот продажів" value={current.revenueSales} prev={previous.revenueSales} net={current.netSales} money={money} settings={settings} />
        <KpiCard label="Чистий дохід" value={current.netSalon} prev={previous.netSalon} money={money} settings={settings} />
        <KpiCard label="Оплата майстрам" value={current.masterPay} prev={previous.masterPay} money={money} settings={settings} />
        <KpiCard label="Витрати" value={current.expensesTotal} prev={previous.expensesTotal} money={money} settings={settings} />
        <KpiCard
          label="Маржинальність"
          value={current.margin * 100}
          prev={previous.margin * 100}
          money={(n) => `${n.toFixed(1)}%`}
          settings={settings}
          hint={`${money(current.netSalon)} / ${money(totalRevenue)}`}
        />
      </div>

      <div className="mt-5 h-56 -mx-2">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f4" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} width={48} />
              <Tooltip
                formatter={(value, name) => [money(Number(value) || 0), name === "revenue" ? "Оборот" : "Чистий"]}
                labelFormatter={(l) => `Дата: ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,0.06)" }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#9ca3af" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-[11px] text-gray-400">
            Немає даних за період
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-gray-400" /> Оборот
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-[#8b5cf6]" /> Чистий дохід
        </span>
        <span className="ml-auto text-gray-400">
          Попередній період: {money(prevRevenue)} → {money(totalRevenue)}
        </span>
      </div>
    </div>
  );
}
