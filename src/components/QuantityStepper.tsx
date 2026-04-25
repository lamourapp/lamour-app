"use client";

/**
 * iOS-style quantity stepper: горизонтальна pill `[−] N [+]`.
 *
 * Чому не `<input type="number">`: iOS Safari рендерить крихітні вертикальні
 * spinner-стрілки які складно влучити пальцем (фізично <16px), і вони
 * конфліктують з мобільною клавіатурою. Apple HIG (й їхні власні додатки —
 * Reminders, Store, Notes) використовують горизонтальну тричасткову
 * pill-кнопку з мінімум 44pt тап-зонами.
 *
 * Інтеракції:
 * - Тап `−`/`+` змінює значення на `step` (default=1) з лімітами min/max.
 * - Тап на число → відкриває native numeric keyboard для ручного вводу.
 *   Під час вводу значення може порушувати min/max — на blur клемимо.
 * - `active:scale-95` дає тактильний фідбек на тапі (iOS-feel).
 * - `navigator.vibrate(8)` — short haptic, де доступно (Android; iOS PWA
 *   ігнорує — там Web Vibration API вимкнено, але це не ламає UX).
 *
 * Підтримує decimal step (наприклад мл/шт у калькуляції): step=0.1, або
 * step=10 для більших значень. Ввід через клавіатуру приймає коми/крапки.
 */

import { useState, useRef, useEffect } from "react";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Декілька знаків після коми у текстовому представленні. Default: 0 для int-step, 2 для дробів. */
  precision?: number;
  /** Ширина центрального поля у px. Default: 56 (≥3 цифри + padding). */
  numberWidth?: number;
  /** Disabled всю pill (наприклад, поки товар не обраний). */
  disabled?: boolean;
  /** ARIA-label для скрін-рідерів. */
  ariaLabel?: string;
}

function haptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(8); } catch { /* iOS Safari: noop */ }
  }
}

function clamp(v: number, min: number | undefined, max: number | undefined): number {
  let n = v;
  if (typeof min === "number" && n < min) n = min;
  if (typeof max === "number" && n > max) n = max;
  return n;
}

function formatValue(v: number, precision: number): string {
  if (precision === 0) return String(Math.round(v));
  return Number(v.toFixed(precision)).toString();
}

export default function QuantityStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  precision,
  numberWidth = 56,
  disabled = false,
  ariaLabel = "Кількість",
}: Props) {
  const prec = precision ?? (Number.isInteger(step) ? 0 : 2);
  const [editing, setEditing] = useState(false);
  // Локальний draft під час ручного вводу — щоб не клемити min/max на кожен
  // keystroke (інакше юзер не може стерти "1" щоб ввести "10").
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const atMin = typeof min === "number" && value <= min;
  const atMax = typeof max === "number" && value >= max;

  function bump(delta: number) {
    if (disabled) return;
    haptic();
    onChange(clamp(value + delta, min, max));
  }

  function commitDraft() {
    setEditing(false);
    const normalized = draft.replace(",", ".").trim();
    if (normalized === "") {
      // Порожнє поле трактуємо як min або 0
      onChange(clamp(typeof min === "number" ? min : 0, min, max));
      return;
    }
    const parsed = parseFloat(normalized);
    if (!Number.isFinite(parsed)) return;
    onChange(clamp(parsed, min, max));
  }

  return (
    <div
      className={`inline-flex items-stretch h-11 rounded-full bg-gray-100 select-none ${
        disabled ? "opacity-40" : ""
      }`}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => bump(-step)}
        disabled={disabled || atMin}
        aria-label="Зменшити"
        className={`w-11 h-11 flex items-center justify-center rounded-l-full text-[18px] font-medium transition-all ${
          atMin || disabled
            ? "text-gray-300 cursor-not-allowed"
            : "text-gray-700 active:scale-90 active:bg-gray-200 cursor-pointer"
        }`}
      >
        −
      </button>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
          }}
          style={{ width: numberWidth }}
          className="h-11 bg-transparent text-center text-[15px] font-medium text-gray-900 tabular-nums outline-none border-x border-gray-200"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setDraft(formatValue(value, prec));
            setEditing(true);
          }}
          disabled={disabled}
          style={{ width: numberWidth }}
          className="h-11 flex items-center justify-center text-[15px] font-medium text-gray-900 tabular-nums border-x border-gray-200 cursor-pointer active:bg-gray-200 transition-colors"
          aria-label={`${ariaLabel}: ${formatValue(value, prec)}. Натисніть для ручного вводу`}
        >
          {formatValue(value, prec)}
        </button>
      )}

      <button
        type="button"
        onClick={() => bump(step)}
        disabled={disabled || atMax}
        aria-label="Збільшити"
        className={`w-11 h-11 flex items-center justify-center rounded-r-full text-[18px] font-medium transition-all ${
          atMax || disabled
            ? "text-gray-300 cursor-not-allowed"
            : "text-gray-700 active:scale-90 active:bg-gray-200 cursor-pointer"
        }`}
      >
        +
      </button>
    </div>
  );
}
