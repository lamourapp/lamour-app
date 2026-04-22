"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { inputCls } from "./ui";

/**
 * Пошуковий випадаючий пікер у стилі додатку — bordered brand-chip коли
 * вибрано, search-input з іконкою коли відкрито, dropdown з зі снапом на
 * мобільних і опціональними групами.
 *
 * Раніше жив як SearchablePicker всередині ServiceEntryModal для вибору
 * послуги; винесено для повторного використання (матеріали в калькуляторі
 * послуги і в записі журналу, щоб не було нативних `<select>` з системною
 * графікою, яка не пасує до стилю PWA).
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
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === selectedId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
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

  return (
    <div ref={wrapperRef} className="relative">
      {selected && !open ? (
        <div
          className="w-full rounded-xl border border-brand-200 bg-brand-50/40 px-3.5 py-2.5 flex items-center justify-between cursor-pointer min-h-[44px]"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <div className="flex-1 min-w-0">{renderSelected(selected)}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); }}
            className="w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-gray-400 hover:text-gray-600 text-[12px] ml-2 cursor-pointer flex-shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${inputCls} pl-10`}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-[260px] overflow-y-auto z-50">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-gray-400 text-center">Нічого не знайдено</div>
          ) : grouped ? (
            Array.from(grouped.entries()).map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 sticky top-0 border-b border-black/5">
                  {group}
                </div>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item.id); setQuery(""); setOpen(false); }}
                    className={`w-full text-left px-3.5 py-2.5 hover:bg-brand-50 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
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
                onClick={() => { onSelect(item.id); setQuery(""); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 hover:bg-brand-50 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
                  item.id === selectedId ? "bg-brand-50" : ""
                }`}
              >
                {renderItem(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
