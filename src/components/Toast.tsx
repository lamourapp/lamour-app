"use client";

/**
 * iOS-style toast: slide-down banner зверху екрану, auto-dismiss.
 *
 * Заміна `alert()` / `confirm()` (системні діалоги ламають iOS-feel —
 * блокують UI, виглядають як browser-chrome а не як додаток). Toast —
 * inline-нотифікація як у Mail/Reminders: мала, рухомa, не блокує клік.
 *
 * Архітектура — single-singleton store (як settings/specialists), щоб
 * будь-який компонент міг гукнути `toast.show(...)` без proper-drilling.
 *
 * Variants:
 * - success — зелений (типове підтвердження)
 * - error — червоний (alert-replacement)
 * - info — нейтральний (default)
 */

import { useSyncExternalStore } from "react";

export type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  /** ms; 0 = sticky (треба ручний dismiss). */
  duration: number;
}

type Listener = () => void;

const state = {
  toasts: [] as Toast[],
  listeners: new Set<Listener>(),
  nextId: 1,
};

function notify() {
  for (const l of state.listeners) l();
}

function dismiss(id: number) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  notify();
}

function show(message: string, variant: ToastVariant = "info", duration = 2800): number {
  const id = state.nextId++;
  state.toasts = [...state.toasts, { id, message, variant, duration }];
  notify();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

/** Public API. Викликається звідки завгодно (компоненти, async-callback-и). */
export const toast = {
  success: (msg: string, duration?: number) => show(msg, "success", duration),
  error: (msg: string, duration?: number) => show(msg, "error", duration),
  info: (msg: string, duration?: number) => show(msg, "info", duration),
  dismiss,
};

function subscribe(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

function getSnapshot(): readonly Toast[] {
  return state.toasts;
}

function getServerSnapshot(): readonly Toast[] {
  return [];
}

/**
 * Глобальний контейнер. Рендерити один раз у layout, після нього
 * `toast.success(...)` і т.д. з будь-якого місця.
 */
export function ToastContainer() {
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-[min(92vw,420px)]">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t }: { toast: Toast }) {
  const colors: Record<ToastVariant, string> = {
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-gray-900 text-white",
  };
  const icon: Record<ToastVariant, string> = {
    success: "✓",
    error: "!",
    info: "·",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      onClick={() => dismiss(t.id)}
      className={`pointer-events-auto cursor-pointer rounded-2xl shadow-lg backdrop-blur-sm px-4 py-3 flex items-center gap-3 ${colors[t.variant]} animate-toast-in`}
    >
      <span
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[14px] font-bold ${
          t.variant === "info" ? "bg-white/20" : "bg-white/25"
        }`}
        aria-hidden
      >
        {icon[t.variant]}
      </span>
      <span className="text-[14px] font-medium leading-snug flex-1">{t.message}</span>
    </div>
  );
}
