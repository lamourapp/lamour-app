/**
 * Design tokens — shared class strings used across the app.
 *
 * All UI primitives (Button, Input, Select, Label, Modal, Card) pull from these
 * tokens so a single edit updates the whole app. In future a theme switcher can
 * swap the token file (or dynamically rewrite the palette) without touching
 * individual components.
 */

/* ─── Form controls ─── */
export const controlBase =
  "w-full rounded-xl border border-black/10 bg-white text-[16px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 transition-colors";

export const inputCls = `${controlBase} px-3.5 h-[44px]`;

// Native <select> with custom chevron baked into background-image (no extra DOM).
export const selectCls = `${controlBase} px-3.5 h-[44px] cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%239ca3af%22%20d%3D%22M2%204l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8`;

export const textareaCls = `${controlBase} px-3.5 py-2.5 min-h-[80px]`;

/* ─── Labels ─── */
export const labelCls =
  "block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5";

/* ─── Buttons ─── */
// active:scale-95 — iOS-feel tactile feedback на тапі. На UIKit-кнопках
// є невелика «прес-анімація»; це її аналог. Не заважає клік-у на
// desktop (active спрацьовує на mousedown і миттєво відпускається).
export const btnBase =
  "inline-flex items-center justify-center rounded-xl font-medium cursor-pointer transition-all active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";

export const btnSizes = {
  sm: "h-[36px] px-3 text-[13px]",
  md: "h-[44px] px-4 text-[14px]",
  lg: "h-[48px] px-5 text-[15px]",
} as const;

export const btnVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
  ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
  danger: "bg-red-500 text-white hover:bg-red-600",
  "danger-ghost": "bg-transparent text-red-500 hover:bg-red-50",
} as const;

/* ─── Cards ─── */
export const cardCls =
  "bg-white rounded-xl border border-black/[0.06] transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]";

/* ─── Segmented control ─── */
export const segmentedWrap = "flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5";
export const segmentedItem =
  "flex-1 px-2 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all";
export const segmentedItemActive = "bg-brand-600 text-white shadow-sm";
export const segmentedItemIdle = "text-gray-500 hover:text-gray-800";
