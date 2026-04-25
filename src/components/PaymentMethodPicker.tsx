"use client";

import type { PaymentMethod } from "@/lib/types";

/**
 * PaymentMethodPicker — вибір каси для фінансової операції.
 *
 * Використовується в усіх модалках створення/редагування записів журналу
 * (послуга, продаж, витрата, борг, виплата). Дві пілюлі: готівка / карта.
 * Значення має відповідати опціям Airtable singleSelect «вид оплати»
 * (див. SERVICE_FIELDS.paymentType). Нові опції створює typecast=true.
 *
 * `value` може бути `undefined` для історичних записів, де метод невідомий.
 */
export default function PaymentMethodPicker({
  value,
  onChange,
  compact = false,
}: {
  value: PaymentMethod | undefined;
  onChange: (v: PaymentMethod) => void;
  /** compact=true зменшує висоту під форми-модалки зі щільними полями. */
  compact?: boolean;
}) {
  const h = compact ? "py-1.5" : "py-2";
  const base =
    `flex-1 ${h} rounded-lg text-[13px] font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5`;
  const active = "bg-brand-50 text-brand-700 border border-brand-200";
  const inactive = "bg-gray-50 text-gray-500 border border-black/5 hover:bg-gray-100";
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange("готівка")}
        className={`active:scale-[0.97] transition-transform ${base} ${value === "готівка" ? active : inactive}`}
        aria-pressed={value === "готівка"}
      >
        <span aria-hidden>💵</span> Готівка
      </button>
      <button
        type="button"
        onClick={() => onChange("карта")}
        className={`active:scale-[0.97] transition-transform ${base} ${value === "карта" ? active : inactive}`}
        aria-pressed={value === "карта"}
      >
        <span aria-hidden>💳</span> Карта
      </button>
    </div>
  );
}
