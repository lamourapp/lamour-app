"use client";

import { useEffect, useRef, useState } from "react";

interface PinPadProps {
  length?: number;
  autoFocus?: boolean;
  onComplete: (pin: string) => void;
  /** Key that, when changed, resets the input (e.g. after a failed attempt). */
  resetSignal?: number;
  disabled?: boolean;
}

/** 4-digit PIN input with auto-advance between cells. */
export default function PinPad({
  length = 4,
  autoFocus = true,
  onComplete,
  resetSignal,
  disabled,
}: PinPadProps) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setDigits(Array(length).fill(""));
    refs.current[0]?.focus();
  }, [resetSignal, length]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "").slice(0, 1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
    if (next.every((d) => d.length === 1)) onComplete(next.join(""));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const data = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!data) return;
    e.preventDefault();
    const next = Array(length).fill("").map((_, i) => data[i] ?? "");
    setDigits(next);
    const lastFilled = Math.min(data.length, length) - 1;
    if (lastFilled >= 0) refs.current[Math.min(lastFilled + 1, length - 1)]?.focus();
    if (data.length === length) onComplete(data);
  }

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          disabled={disabled}
          value={digits[i]}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          className="w-11 h-12 text-center text-lg font-semibold tabular-nums border border-black/10 rounded-xl focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 transition-colors disabled:opacity-50"
        />
      ))}
    </div>
  );
}
