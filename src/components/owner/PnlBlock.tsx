"use client";

import { useState } from "react";
import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter } from "@/lib/format";

/**
 * P&L-каскад за обраний період: Оборот → Виплати → Витрати → Чистий →
 * (Вилучено/Довнесено власником) → Нерозподілений залишок.
 *
 * «Оборот» expandable: розгортається в послуги/матеріали/товари. Під
 * «Оборот» і «Витрати» — meta-рядок з розбивкою по касах, щоб видно було
 * з якої каси скільки зайшло/пішло за період.
 */

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
  netSalon: number;
  masterPay: number;
  expensesTotal: number;
  ownerWithdrawals: number;
  ownerContributions: number;
  revenueByMethod: { cash: number; card: number; unknown: number };
  expensesByMethod: { cash: number; card: number; unknown: number };
}

interface Props {
  current: Aggregates;
  settings: Settings | null | undefined;
  loading: boolean;
  className?: string;
}

function PnlRow({
  label, value, money, indent = 0, sign, emphasis = "normal",
  expandable, expanded, onToggle,
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
      <span className={`w-3 shrink-0 text-[11px] font-semibold ${signColor}`}>{sign || ""}</span>
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

function CashMeta({ cash, card, unknown, money }: {
  cash: number; card: number; unknown: number;
  money: (n: number) => string;
}) {
  const hasUnknown = Math.abs(unknown) > 0.5;
  if (Math.abs(cash) + Math.abs(card) + Math.abs(unknown) < 1) return null;
  return (
    <div className="text-[10px] text-gray-400 tabular-nums pl-5 flex gap-2 flex-wrap -mt-0.5 mb-1">
      <span>💵 {money(Math.round(cash))}</span>
      <span className="text-gray-300">·</span>
      <span>💳 {money(Math.round(card))}</span>
      {hasUnknown && (
        <>
          <span className="text-gray-300">·</span>
          <span title="Історичні записи без вказаної каси">? {money(Math.round(unknown))}</span>
        </>
      )}
    </div>
  );
}

export default function PnlBlock({ current, settings, loading, className = "" }: Props) {
  const money = moneyFormatter(settings);
  const totalRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  const netProfit = current.netSalon;
  const undistributed = netProfit - current.ownerWithdrawals + current.ownerContributions;

  const [expandedRevenue, setExpandedRevenue] = useState(false);

  return (
    <div className={`bg-white rounded-xl border border-black/[0.06] p-4 md:p-5 ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">P&amp;L за період</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Від обороту до нерозподіленого залишку
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      <div className="bg-gray-50/50 rounded-xl border border-black/[0.04] px-4 py-3">
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
        <CashMeta {...current.revenueByMethod} money={money} />
        {expandedRevenue && (
          <>
            <PnlRow label="послуги" value={current.revenueServices} money={money} indent={1} emphasis="muted" />
            <PnlRow label="матеріали у послугах" value={current.revenueMaterials} money={money} indent={1} emphasis="muted" />
            <PnlRow label="продаж товарів" value={current.revenueSales} money={money} indent={1} emphasis="muted" />
          </>
        )}
        <PnlRow label="Виплати майстрам" value={current.masterPay} money={money} sign="−" />
        <PnlRow label="Витрати" value={current.expensesTotal} money={money} sign="−" />
        <CashMeta {...current.expensesByMethod} money={money} />
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
    </div>
  );
}
