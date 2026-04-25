"use client";

import { ReactNode, useRef, useState } from "react";

/**
 * Base modal shell — bottom-sheet on mobile, centered card on sm+ screens.
 *
 * iOS-feel:
 *   • Mobile (<sm) — bottom-sheet з grab-handle зверху і swipe-to-dismiss.
 *     Юзер тягне вниз від хедера → sheet їде за пальцем → відпуск нижче
 *     порогу → onClose. Як у нативному UIKit.
 *   • Desktop (sm+) — центрована картка, без свайпу (бо ←→ нерелевантно).
 *
 * Поріг зачинення: pull > 100px АБО vy > 0.5 px/ms (швидкий flick).
 * Менше — пружинимо назад до 0 з transition (~250ms).
 *
 * Usage:
 *   <Modal title="Нова витрата" onClose={...}>
 *     <fields />
 *     <Button fullWidth onClick={submit}>Зберегти</Button>
 *   </Modal>
 */
export default function Modal({
  title,
  onClose,
  children,
  width = "md",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const widthCls = {
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
  }[width];

  // Swipe-to-dismiss: state живе в ref-ах щоб не ребіндити touchmove на
  // кожному кадрі (60fps × setState = laggy). Trigger re-render тільки
  // на startX (initial), end (snap), і closing.
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);
  const lastDragY = useRef<number>(0);
  const [dragging, setDragging] = useState(false);

  function onTouchStart(e: React.TouchEvent) {
    // Тільки на мобілці. На sm+ свайп не потрібен — desktop клацає mouse.
    if (typeof window !== "undefined" && window.innerWidth >= 640) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    lastDragY.current = 0;
    setDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    // Тягнути вниз можна, вгору — ні (sheet не «висить» вище natural).
    if (dy < 0) return;
    lastDragY.current = dy;
    // Прямий стиль (без setState) — щоб 60fps не давав jank.
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = "none";
    }
  }

  function onTouchEnd() {
    if (dragStartY.current === null) return;
    const dy = lastDragY.current;
    const dt = Math.max(1, Date.now() - dragStartTime.current);
    const vy = dy / dt; // px/ms
    dragStartY.current = null;
    setDragging(false);

    if (sheetRef.current) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      // Закриваємо якщо потягли далеко або зробили швидкий flick вниз.
      if (dy > 100 || vy > 0.5) {
        sheetRef.current.style.transform = "translateY(100%)";
        // Чекаємо завершення анімації — потім реально zachiniaємо
        // (інакше unmount зриває transition і sheet просто зникає).
        setTimeout(() => onClose(), 220);
      } else {
        sheetRef.current.style.transform = "translateY(0)";
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={sheetRef}
        className={`relative bg-white w-full ${widthCls} sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl ${
          dragging ? "" : "transition-transform duration-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab-handle: тільки на мобілці (sm:hidden). Свайп слухаємо
            на цьому елементі + хедері — НЕ на тілі модалу, інакше скрол
            всередині (наприклад, у списку товарів) конфліктує. */}
        <div
          className="sm:hidden flex justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>

        <div
          className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-black/5 px-5 py-3 sm:py-4 flex items-center justify-between z-10 sm:rounded-t-2xl"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 active:bg-gray-200 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            aria-label="Закрити"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        {/* Safe-area: на iPhone з home-bar (X+) додаємо знизу відступ
            щоб остання кнопка не перекривалась рискою. Android/desktop:
            env(safe-area-inset-bottom) = 0 → no-op. */}
        <div className="h-6" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}
