"use client";

import { useState } from "react";
import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter } from "@/lib/format";
import { Button } from "@/components/ui";
import PurchaseModal from "./PurchaseModal";

/**
 * Фонд матеріалів.
 *
 * Окремий грошовий потік: собівартість матеріалів (matCost з послуг +
 * costPrice з продажів) накопичується тут, а реальні виплати
 * постачальникам зменшують баланс.
 *
 * Чому це треба:
 *   у касі лежать гроші, які насправді належать постачальникам — вони
 *   ще не сплачені, але вже зароблені на продажі матеріалів. Якщо
 *   власник виведе їх як прибуток, на закупку не залишиться.
 *
 * Показує:
 *   - Накопичено за період (period materialsCogs)
 *   - Сплачено за період (period materialsPaid)
 *   - Залишок (cumulative balance = all-time accrued − all-time paid)
 */

interface Props {
  materialsCogsPeriod: number;
  materialsPaidPeriod: number;
  balanceCumulative: number;
  settings: Settings | null | undefined;
  loading: boolean;
  onChanged?: () => void;
}

export default function MaterialsFundBlock({
  materialsCogsPeriod,
  materialsPaidPeriod,
  balanceCumulative,
  settings,
  loading,
  onChanged,
}: Props) {
  const money = moneyFormatter(settings);
  const [showModal, setShowModal] = useState(false);

  // Інтерпретація залишку:
  //   > 0 — у касі є непереведені постачальнику кошти (нормально, треба платити)
  //   = 0 — все рівно
  //   < 0 — переплатили постачальнику авансом (рідко, але можливо)
  const balanceColor =
    balanceCumulative > 0
      ? "text-emerald-600"
      : balanceCumulative < 0
        ? "text-amber-600"
        : "text-gray-700";

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Фонд матеріалів</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Кошти у касі, що належать постачальникам
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      <div className="space-y-2">
        <Row label="Накопичено за період" value={materialsCogsPeriod} money={money} sign="+" />
        <Row label="Сплачено за період" value={materialsPaidPeriod} money={money} sign="−" />
        <div className="border-t border-black/5 pt-2 mt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-semibold text-gray-900">Залишок (на сьогодні)</span>
            <span className={`text-[15px] font-semibold tabular-nums ${balanceColor}`}>
              {money(balanceCumulative)}
            </span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1 leading-snug">
            Сума, яку треба тримати в касі для постачальників (накопичено за весь час − усі виплати).
          </p>
        </div>
      </div>

      <Button
        variant="secondary"
        fullWidth
        className="mt-4"
        onClick={() => setShowModal(true)}
      >
        + Оплата постачальнику
      </Button>

      {showModal && (
        <PurchaseModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function Row({
  label, value, money, sign,
}: {
  label: string;
  value: number;
  money: (n: number) => string;
  sign: "+" | "−";
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12px] text-gray-700">{label}</span>
      <span className="text-[13px] text-gray-900 font-medium tabular-nums">
        {sign === "−" && value !== 0 && <span className="text-gray-400 mr-0.5">−</span>}
        {sign === "+" && value !== 0 && <span className="text-emerald-500 mr-0.5">+</span>}
        {money(value)}
      </span>
    </div>
  );
}
