"use client";

import { useState } from "react";
import type { Settings } from "@/app/api/settings/route";
import type { MasterOwed } from "@/app/api/owner/balances/route";
import { moneyFormatter } from "@/lib/format";

/**
 * «Винні майстрам» — lifetime-баланс нараховано мінус виплачено по кожному
 * майстру (формульне + ручні «+ЗП», мінус фактичні виплати). Від'ємні —
 * переплата майстру. Живе у sidebar поруч із касою: обидва блоки lifetime,
 * operational.
 */

interface Props {
  owedToMasters: MasterOwed[];
  owedTotal: number;
  settings: Settings | null | undefined;
  className?: string;
}

export default function OwedMasters({ owedToMasters, owedTotal, settings, className = "" }: Props) {
  const money = moneyFormatter(settings);
  const [expanded, setExpanded] = useState(false);

  if (owedToMasters.length === 0) return null;

  return (
    <div className={`rounded-xl border border-amber-200/70 bg-amber-50/40 px-4 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-baseline justify-between cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-amber-700 uppercase tracking-wider font-semibold">
            Винні майстрам
          </span>
          <span className="text-[10px] text-amber-600/80">{expanded ? "▾" : "▸"}</span>
        </div>
        <div className="text-[14px] font-semibold text-amber-900 tabular-nums">
          {money(Math.round(owedTotal))}
        </div>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {owedToMasters.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-[12px]">
              <span className="text-gray-700 truncate pr-2">{m.name}</span>
              <span
                className={`tabular-nums font-medium ${m.owed < 0 ? "text-emerald-600" : "text-gray-900"}`}
                title={`Нараховано ${money(Math.round(m.accrued))} − Виплачено ${money(Math.round(m.paid))}`}
              >
                {money(Math.round(m.owed))}
              </span>
            </div>
          ))}
          <div className="text-[10px] text-gray-500 pt-1 border-t border-amber-200/60 mt-1.5 leading-relaxed">
            За всю історію. Нараховано з виконаних послуг/продажів (і ручних «+ЗП»)
            мінус фактичні виплати. Від&apos;ємні числа — переплата майстру.
          </div>
        </div>
      )}
    </div>
  );
}
