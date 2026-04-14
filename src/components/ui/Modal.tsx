"use client";

import { ReactNode } from "react";

/**
 * Base modal shell — bottom-sheet on mobile, centered card on sm+ screens.
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative bg-white w-full ${widthCls} sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-black/5 px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-[16px] font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            aria-label="Закрити"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">{children}</div>
        <div className="h-6" />
      </div>
    </div>
  );
}
