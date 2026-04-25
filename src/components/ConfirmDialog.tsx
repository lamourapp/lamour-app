"use client";

/**
 * iOS-style confirmation dialog. Заміна `window.confirm()`.
 *
 * Чому не native `confirm()`: на iOS Safari в standalone-PWA він
 * рендериться як browser-chrome alert (адресна стрічка проступає,
 * шрифт системний — ламає feel додатку). Наш дайалог — це справжній
 * action sheet з backdrop-blur і tactile-кнопками.
 *
 * Шаблон використання — двома способами:
 *   1. Як inline-компонент: `{confirmOpen && <ConfirmDialog ... />}`
 *      (контролюєш state у parent).
 *   2. Через імперативний хелпер `confirmDialog({ title, ... })` →
 *      повертає Promise<boolean>. Зручно у async-handler-ах:
 *
 *        if (!await confirmDialog({ title: "Видалити?", ... })) return;
 *        await fetch(...);
 *
 *   Хелпер сам монтує/демонтує дайалог через portal — не треба
 *   тримати state у parent. Працює тільки на client.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Текст кнопки підтвердження. Default: «Підтвердити». */
  confirmText?: string;
  /** Текст кнопки скасування. Default: «Скасувати». */
  cancelText?: string;
  /** destructive=true → червона кнопка (видалення/незворотні дії). */
  destructive?: boolean;
}

interface Props extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText = "Підтвердити",
  cancelText = "Скасувати",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  // ESC закриває (cancel-path), як native confirm.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-toast-in"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 pt-6 pb-4 text-center">
          <h3 className="text-[17px] font-semibold text-gray-900 mb-1">{title}</h3>
          {message && (
            <p className="text-[13px] text-gray-500 leading-relaxed">{message}</p>
          )}
        </div>
        <div className="border-t border-black/[0.08] flex">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 h-12 text-[15px] text-gray-700 font-medium active:bg-gray-100 cursor-pointer"
          >
            {cancelText}
          </button>
          <div className="w-px bg-black/[0.08]" />
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 h-12 text-[15px] font-semibold cursor-pointer ${
              destructive
                ? "text-red-600 active:bg-red-50"
                : "text-brand-600 active:bg-brand-50"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Імперативний хелпер: `await confirmDialog({ title, ... })` → boolean.
 *
 * Монтує дайалог у тимчасовий <div> на body, чекає вибір, демонтує.
 * Зручно коли треба confirm посеред async-handler-а без state в parent.
 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    function cleanup(result: boolean) {
      root.unmount();
      host.remove();
      resolve(result);
    }

    root.render(
      <ConfirmDialog
        open
        {...opts}
        onConfirm={() => cleanup(true)}
        onCancel={() => cleanup(false)}
      />,
    );
  });
}
