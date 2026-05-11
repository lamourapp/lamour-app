"use client";

/**
 * /login — app-level PIN gate.
 *
 * 6 квадратиків. Авто-перехід до наступного при вводі. Backspace стрибає назад.
 * Paste 6-значного числа — заповнює все одразу. Submit — як тільки введено 6.
 * Перевіряється проти env SALON_PIN на сервері (/api/auth/login).
 *
 * Після успіху — куки виставляються сервером, ми редіректимо на ?next= або /.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LEN = 6;

function LoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(""));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function setDigit(i: number, ch: string) {
    const clean = ch.replace(/\D/g, "").slice(0, 1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    setError("");
    if (clean && i < LEN - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LEN);
    if (text.length === 0) return;
    e.preventDefault();
    const next = Array(LEN).fill("");
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    refs.current[Math.min(text.length, LEN - 1)]?.focus();
  }

  async function submit(pin: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || "Невірний PIN");
      }
      // Куки виставив сервер. Робимо повний reload, щоб middleware побачив куки.
      window.location.href = next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка");
      setDigits(Array(LEN).fill(""));
      refs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  // Авто-сабмит коли введено 6 цифр.
  useEffect(() => {
    const joined = digits.join("");
    if (joined.length === LEN && !submitting) {
      submit(joined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits.join("")]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-[20px] font-semibold text-gray-900 tracking-tight">
            Лямурчик
          </div>
          <div className="text-[13px] text-gray-500 mt-1">
            Введіть PIN, щоб увійти
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/[0.06] p-6 shadow-sm">
          <div className="flex justify-center gap-2 sm:gap-2.5">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={d}
                disabled={submitting}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onPaste={onPaste}
                className={`w-10 h-12 sm:w-11 sm:h-13 text-center text-[20px] font-semibold rounded-xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 transition-all tabular-nums ${
                  error
                    ? "border-rose-300 focus:ring-rose-300 text-rose-600"
                    : d
                      ? "border-brand-300 focus:ring-brand-300 text-gray-900"
                      : "border-black/[0.08] focus:ring-brand-300 text-gray-900"
                }`}
                aria-label={`Цифра ${i + 1}`}
              />
            ))}
          </div>
          <div className="h-5 mt-4 text-center text-[12px]">
            {error ? (
              <span className="text-rose-500">{error}</span>
            ) : submitting ? (
              <span className="text-gray-400">Перевіряю…</span>
            ) : (
              <span className="text-gray-300">&nbsp;</span>
            )}
          </div>
        </div>

        <div className="text-center text-[11px] text-gray-400 mt-6">
          PIN потрібен лише при першому вході або раз на 30 днів
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <LoginInner />
    </Suspense>
  );
}
