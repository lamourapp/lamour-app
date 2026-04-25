"use client";

/**
 * Barcode scanner — мультискан з камери смартфона.
 *
 * Чому @zxing/browser: працює в iOS Safari (через getUserMedia), підтримує
 * EAN-13/EAN-8/Code-128 (стандарти штрихкодів на товарах салону краси),
 * без серверного OCR. Альтернативи (BarcodeDetector API) — Chrome-only,
 * на iOS не доступне.
 *
 * Flow:
 *   1. Pre-permission screen — пояснюємо для чого камера, кнопка «Дозволити».
 *      Без неї iOS показав би системний промпт прямо на blank екрані —
 *      користувачі лякаються і відмовляються.
 *   2. Camera live preview + автоматичне сканування. Кожен успішний
 *      decode викликає `onScan(code)`, далі debounce (тимчасово
 *      ігноруємо той самий код 1.5s) щоб не дублювати при тримуванні.
 *   3. Multi-scan: сканер не закривається після першого успіху.
 *      Користувач сам тисне «Готово» коли пробив усі товари.
 *      Це швидше для мультипродажів (типовий чек 3-5 позицій).
 *
 * Камеру обираємо з facingMode: "environment" — задня камера на смартфонах.
 * На десктопі (тестування) браузер дасть фронталку — не критично.
 */

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { toast } from "./Toast";

interface Props {
  /** Викликається на кожен успішний скан (унікальний у межах debounce). */
  onScan: (code: string) => void;
  /** Закрити сканер. */
  onClose: () => void;
}

type Stage = "permission" | "scanning" | "denied" | "error";

/** Debounce: ігноруємо повторний той самий код впродовж цього інтервалу. */
const REPEAT_DEBOUNCE_MS = 1500;

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("permission");
  const [errorMsg, setErrorMsg] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);

  // Запускаємо сканер коли користувач натиснув «Дозволити» і відрендерився
  // <video>. Без useEffect — useRef.current був би null під час першого
  // setStage("scanning").
  useEffect(() => {
    if (stage !== "scanning") return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        // facingMode: environment → задня камера. На iOS треба саме об'єкт
        // constraints (а не deviceId), бо точний deviceId доступний лише
        // після першого getUserMedia → знадобився б другий запит дозволу.
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              const code = result.getText();
              const now = Date.now();
              const last = lastScanRef.current;
              // Debounce: однаковий код підряд — ігнор. Інший код одразу OK.
              if (last && last.code === code && now - last.at < REPEAT_DEBOUNCE_MS) return;
              lastScanRef.current = { code, at: now };
              // Haptic фідбек на успіх (Android; iOS PWA noop).
              if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
                try { navigator.vibrate(15); } catch { /* noop */ }
              }
              onScan(code);
            }
            // err — це NotFoundException на кожному кадрі без штрихкоду,
            // це нормальний потік; справжні помилки приходять через reject.
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name || "";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          setStage("denied");
        } else {
          setErrorMsg(e instanceof Error ? e.message : "Не вдалося запустити камеру");
          setStage("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [stage, onScan]);

  function handleAllow() {
    setStage("scanning");
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur-md">
        <div className="text-white text-[15px] font-semibold">Сканер штрихкодів</div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[13px] font-medium active:bg-white/20 cursor-pointer"
        >
          Готово
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 relative overflow-hidden">
        {stage === "permission" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-[32px] mb-4">
              📷
            </div>
            <h2 className="text-white text-[18px] font-semibold mb-2">
              Доступ до камери
            </h2>
            <p className="text-white/70 text-[14px] leading-relaxed mb-6 max-w-xs">
              Для сканування штрихкодів потрібен доступ до камери смартфона.
              Зображення обробляється локально і нікуди не надсилається.
            </p>
            <button
              type="button"
              onClick={handleAllow}
              className="w-full max-w-xs h-12 rounded-xl bg-white text-gray-900 text-[15px] font-semibold active:scale-95 transition-transform cursor-pointer"
            >
              Дозволити доступ
            </button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 text-white/60 text-[13px] active:text-white/80 cursor-pointer"
            >
              Скасувати
            </button>
          </div>
        )}

        {stage === "scanning" && (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            {/* Aim frame */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[78%] max-w-sm aspect-[3/2] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] relative">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-2xl" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-2xl" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-2xl" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-2xl" />
              </div>
            </div>
            <div className="absolute bottom-8 left-0 right-0 text-center px-6">
              <p className="text-white text-[13px] bg-black/60 backdrop-blur-md inline-block px-4 py-2 rounded-full">
                Наведіть камеру на штрихкод. Можна сканувати кілька товарів підряд.
              </p>
            </div>
          </>
        )}

        {stage === "denied" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-[32px] mb-4">
              🚫
            </div>
            <h2 className="text-white text-[18px] font-semibold mb-2">
              Доступ заборонено
            </h2>
            <p className="text-white/70 text-[14px] leading-relaxed mb-6 max-w-xs">
              Дозвольте камеру в налаштуваннях браузера і перезавантажте сторінку.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full max-w-xs h-12 rounded-xl bg-white/10 text-white text-[15px] font-semibold active:bg-white/20 cursor-pointer"
            >
              Закрити
            </button>
          </div>
        )}

        {stage === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center text-[32px] mb-4">
              ⚠️
            </div>
            <h2 className="text-white text-[18px] font-semibold mb-2">
              Помилка камери
            </h2>
            <p className="text-white/70 text-[13px] leading-relaxed mb-6 max-w-xs break-words">
              {errorMsg || "Не вдалося запустити камеру"}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full max-w-xs h-12 rounded-xl bg-white/10 text-white text-[15px] font-semibold active:bg-white/20 cursor-pointer"
            >
              Закрити
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Helper: знайти продукт за відсканованим кодом.
 * Перевіряємо barcode → article → sku (FAQ-логіка: на пляшках буває тільки
 * штрихкод EAN, а на коробках/маркуванні — артикул, в наклейці — SKU).
 */
export function findProductByCode<T extends { barcode?: string; article?: string; sku?: string }>(
  products: T[],
  code: string,
): T | undefined {
  const norm = code.trim();
  if (!norm) return undefined;
  return products.find(
    (p) =>
      (p.barcode && p.barcode.trim() === norm) ||
      (p.article && p.article.trim() === norm) ||
      (p.sku && p.sku.trim() === norm),
  );
}

// Re-export toast just for convenience in scanner consumers.
export { toast };
