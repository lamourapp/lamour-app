"use client";

import { useMemo, useState } from "react";
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
  ownerWithdrawals: number;
  ownerContributions: number;
  cashByMethod: { cash: number; card: number; unknown: number };
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

/**
 * Рядок P&L-каскаду. Використовуємо замість таблиці, щоб мобільний
 * варіант не ламався. Indent = візуальне підпорядкування (послуги
 * всередині обороту, тощо).
 */
function PnlRow({
  label,
  value,
  money,
  indent = 0,
  sign,
  emphasis = "normal",
  expandable,
  expanded,
  onToggle,
}: {
  label: string;
  value: number;
  money: (n: number) => string;
  indent?: 0 | 1;
  sign?: "+" | "−" | "=" | null;
  emphasis?: "normal" | "muted" | "strong" | "total";
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const label_cls = {
    normal: "text-[12px] text-gray-700",
    muted: "text-[11px] text-gray-500",
    strong: "text-[13px] font-medium text-gray-900",
    total: "text-[13px] font-semibold text-gray-900",
  }[emphasis];
  const value_cls = {
    normal: "text-[12px] text-gray-900 font-medium tabular-nums",
    muted: "text-[11px] text-gray-500 tabular-nums",
    strong: "text-[14px] text-gray-900 font-semibold tabular-nums",
    total: "text-[15px] text-gray-900 font-semibold tabular-nums",
  }[emphasis];
  const row_cls = {
    normal: "",
    muted: "",
    strong: "border-t border-black/5 pt-2 mt-1",
    total: "border-t border-gray-300 pt-2 mt-1",
  }[emphasis];
  const signColor = sign === "−" ? "text-rose-500" : sign === "+" ? "text-emerald-600" : sign === "=" ? "text-gray-900" : "text-gray-300";

  const content = (
    <div className={`flex items-baseline gap-2 py-1 ${row_cls}`}>
      <span className={`${value_cls ? "" : ""} w-3 shrink-0 text-[11px] font-semibold ${signColor}`}>
        {sign || ""}
      </span>
      <span className={`flex-1 ${label_cls} ${indent ? "pl-4" : ""}`}>
        {expandable && (
          <span className="inline-block w-3 text-gray-400 mr-0.5 text-[10px]">
            {expanded ? "▾" : "▸"}
          </span>
        )}
        {label}
      </span>
      <span className={value_cls}>{money(value)}</span>
    </div>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left cursor-pointer hover:bg-gray-50/60 -mx-2 px-2 rounded transition-colors"
      >
        {content}
      </button>
    );
  }
  return content;
}

export default function FinancialBlock({ current, previous, daily, settings, loading }: Props) {
  const money = moneyFormatter(settings);
  const totalRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  const prevRevenue = previous.revenueServices + previous.revenueMaterials + previous.revenueSales;

  // P&L-складові — уникаємо подвійного обліку з netSalon (це вже salon share
  // по послугах/продажах без витрат). Для чистого показу каскаду рахуємо
  // від обороту напряму: оборот − виплати майстрам − витрати = чистий.
  const netProfit = current.netSalon; // формулою Airtable, уже з урахуванням витрат
  const undistributed = netProfit - current.ownerWithdrawals + current.ownerContributions;

  const [expandedRevenue, setExpandedRevenue] = useState(false);

  const chartData = useMemo(
    () => daily.map((d) => ({ ...d, label: formatDateShort(d.date) })),
    [daily],
  );

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5 lg:col-span-2">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Фінансовий зріз</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            P&amp;L · KPI · динаміка за обраний період
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {/* Рух по касах за період — скільки реально пройшло через готівку / карту.
          Сума buckets = приріст «кошти в касі» за період (виручка − витрати
          − виплати + довнесення). Unknown — історичні записи без paymentType. */}
      {(() => {
        const { cash, card, unknown } = current.cashByMethod;
        const total = cash + card + unknown;
        return (
          <div className="mb-3 bg-gray-50/50 rounded-xl border border-black/[0.04] px-4 py-3">
            <div className="flex items-baseline justify-between mb-1.5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Рух по касах</div>
              <div className="text-[11px] text-gray-500 tabular-nums">{money(Math.round(total))}</div>
            </div>
            <div className="flex items-center gap-3 text-[12px] tabular-nums flex-wrap">
              <span className="flex items-center gap-1.5">
                <span>💵</span>
                <span className="text-gray-500">Готівка</span>
                <span className="text-gray-900 font-medium">{money(Math.round(cash))}</span>
              </span>
              <span className="text-gray-300">·</span>
              <span className="flex items-center gap-1.5">
                <span>💳</span>
                <span className="text-gray-500">Карта</span>
                <span className="text-gray-900 font-medium">{money(Math.round(card))}</span>
              </span>
              {Math.abs(unknown) > 0.5 && (
                <>
                  <span className="text-gray-300">·</span>
                  <span
                    className="flex items-center gap-1.5"
                    title="Історичні записи без вказаної каси"
                  >
                    <span className="text-gray-400">?</span>
                    <span className="text-gray-400">{money(Math.round(unknown))}</span>
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* P&L-каскад — компактна «стрічка» від обороту до нерозподіленого.
          Оборот розгортається в деталізацію (послуги/товари/матеріали). */}
      <div className="mb-5 bg-gray-50/50 rounded-xl border border-black/[0.04] px-4 py-3">
        <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">
          P&amp;L за період
        </div>
        <PnlRow
          label="Оборот"
          value={totalRevenue}
          money={money}
          sign="+"
          emphasis="strong"
          expandable
          expanded={expandedRevenue}
          onToggle={() => setExpandedRevenue((v) => !v)}
        />
        {expandedRevenue && (
          <>
            <PnlRow label="послуги" value={current.revenueServices} money={money} indent={1} emphasis="muted" />
            <PnlRow label="матеріали у послугах" value={current.revenueMaterials} money={money} indent={1} emphasis="muted" />
            <PnlRow label="продаж товарів" value={current.revenueSales} money={money} indent={1} emphasis="muted" />
          </>
        )}
        <PnlRow label="Виплати майстрам" value={current.masterPay} money={money} sign="−" />
        <PnlRow label="Витрати" value={current.expensesTotal} money={money} sign="−" />
        <PnlRow
          label="Чистий прибуток"
          value={netProfit}
          money={money}
          sign="="
          emphasis="strong"
        />
        {(current.ownerWithdrawals > 0 || current.ownerContributions > 0) && (
          <>
            {current.ownerWithdrawals > 0 && (
              <PnlRow label="Вилучено власником" value={current.ownerWithdrawals} money={money} sign="−" indent={1} emphasis="muted" />
            )}
            {current.ownerContributions > 0 && (
              <PnlRow label="Довнесено власником" value={current.ownerContributions} money={money} sign="+" indent={1} emphasis="muted" />
            )}
            <PnlRow
              label="Нерозподілений залишок"
              value={undistributed}
              money={money}
              sign="="
              emphasis="total"
            />
          </>
        )}
      </div>

      {/* KPI — ТІЛЬКИ те, чого немає в P&L-каскаді зверху.
          Чистий дохід / Оплата майстрам / Витрати → уже є в каскаді,
          показувати їх двічі = сміття. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="Оборот послуг" value={current.revenueServices} prev={previous.revenueServices} money={money} settings={settings} />
        <KpiCard label="Оборот матеріалів" value={current.revenueMaterials} prev={previous.revenueMaterials} net={current.netMaterials} money={money} settings={settings} />
        <KpiCard label="Оборот продажів" value={current.revenueSales} prev={previous.revenueSales} net={current.netSales} money={money} settings={settings} />
        <KpiCard
          label="Маржинальність"
          value={current.margin * 100}
          prev={previous.margin * 100}
          money={(n) => `${n.toFixed(1)}%`}
          settings={settings}
          hint={`${money(current.netSalon)} / ${money(totalRevenue)}`}
        />
      </div>

      <div className="mt-5 h-44 sm:h-56 -mx-2">
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

      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-gray-400" /> Оборот
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-[2px] bg-[#8b5cf6]" /> Чистий дохід
        </span>
        <span className="sm:ml-auto text-gray-400 whitespace-nowrap">
          {money(prevRevenue)} → {money(totalRevenue)}
        </span>
      </div>
    </div>
  );
}
