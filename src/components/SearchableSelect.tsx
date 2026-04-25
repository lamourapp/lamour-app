"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputCls } from "./ui";

/**
 * Єдиний пікер у додатку для вибору з довгого списку (майстер/послуга/товар/
 * матеріал/категорія). Тригер — у стилі app: bordered brand-chip коли
 * вибрано, search-input з іконкою лупи коли порожньо.
 *
 * Кліком відкривається **повноекранний bottom-sheet через portal** (щоб
 * уникнути обрізання `absolute`-списком всередині модалки з overflow-y-auto
 * і клік-хіт-проблем на мобільному). Всередині sheet — sticky search угорі
 * і прокручуваний список.
 *
 * Причина portal: основні форми (ServiceEntryModal, CreateEntryModal)
 * живуть у своїй Modal з `overflow-y-auto` та `max-h:90vh`. Раніше
 * `absolute` дропдаун рендерився всередині — і клік по елементах списку,
 * які вилазили за межі scroll-box, не реєструвався, а сам список
 * обрізався / стрибав з auto-scroll.
 */
export default function SearchableSelect<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  placeholder,
  renderItem,
  renderSelected,
  groupBy,
  searchKey,
  title,
}: {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder: string;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  groupBy?: (item: T) => string;
  /** За замовчуванням — фільтрується по item.name. Для не-name структур передай. */
  searchKey?: (item: T) => string;
  /** Заголовок шита. За замовчуванням — placeholder без трьох крапок. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  const selected = items.find((i) => i.id === selectedId);
  const sheetTitle = title ?? (placeholder.replace(/\.\.\.$/, "").replace(/^Пошук:?\s*/i, "") || "Оберіть");

  return (
    <>
      {/* Trigger */}
      {selected ? (
        <div
          className="w-full rounded-xl border border-brand-200 bg-brand-50/40 px-3.5 py-2.5 flex items-center justify-between cursor-pointer min-h-[44px]"
          onClick={() => setOpen(true)}
        >
          <div className="flex-1 min-w-0">{renderSelected(selected)}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); }}
            className="w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-gray-400 hover:text-gray-600 text-[12px] ml-2 cursor-pointer flex-shrink-0 transition-colors"
            aria-label="Очистити"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`active:scale-[0.97] transition-transform ${inputCls} pl-10 relative flex items-center text-left text-gray-400 cursor-pointer`}
        >
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <span className="truncate">{placeholder}</span>
        </button>
      )}

      {open && (
        <PickerSheet
          title={sheetTitle}
          items={items}
          selectedId={selectedId}
          placeholder={placeholder}
          renderItem={renderItem}
          groupBy={groupBy}
          searchKey={searchKey}
          onSelect={(id) => { onSelect(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/* ─── Sheet (portal) ─── */

function PickerSheet<T extends { id: string }>({
  title,
  items,
  selectedId,
  placeholder,
  renderItem,
  groupBy,
  searchKey,
  onSelect,
  onClose,
}: {
  title: string;
  items: T[];
  selectedId: string;
  placeholder: string;
  renderItem: (item: T) => React.ReactNode;
  groupBy?: (item: T) => string;
  searchKey?: (item: T) => string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus search on open. Delay невеликий, щоб iOS встиг змонтувати sheet
  // і підняти клавіатуру плавно.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  // Escape закриває
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while sheet is open (не обов'язково, але приємніше —
  // фон не прокручується під шітом).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => {
      const name = searchKey
        ? searchKey(i)
        : ((i as Record<string, unknown>).name as string) || "";
      return name.toLowerCase().includes(q);
    });
  }, [items, query, searchKey]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, T[]>();
    filtered.forEach((item) => {
      const g = groupBy(item) || "Інше";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(item);
    });
    return groups;
  }, [filtered, groupBy]);

  // Render via portal щоб втекти з `overflow-y-auto` батьківської модалки.
  if (typeof window === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl h-[85vh] sm:h-auto sm:max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title + ✕ */}
        <div className="px-5 py-3.5 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-gray-900 truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
            aria-label="Закрити"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sticky search */}
        <div className="px-4 pt-3 pb-2 border-b border-black/5">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className={`${inputCls} pl-10`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-[13px] text-gray-400 text-center">Нічого не знайдено</div>
          ) : grouped ? (
            Array.from(grouped.entries()).map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-4 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 sticky top-0 border-b border-black/5 z-10">
                  {group}
                </div>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-brand-50 active:bg-brand-100 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
                      item.id === selectedId ? "bg-brand-50" : ""
                    }`}
                  >
                    {renderItem(item)}
                  </button>
                ))}
              </div>
            ))
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={`w-full text-left px-4 py-3 hover:bg-brand-50 active:bg-brand-100 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
                  item.id === selectedId ? "bg-brand-50" : ""
                }`}
              >
                {renderItem(item)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
