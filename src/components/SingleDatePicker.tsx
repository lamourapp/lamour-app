"use client";

import { useState, useMemo, useEffect, useRef } from "react";

/**
 * SingleDatePicker — одноденний варіант CalendarPicker, тим самим візуальним
 * мовою (той самий grid, ті ж брендові кольори), але без діапазону та
 * пресетів. Використовуємо в модалках форм замість нативного `<input type="date">`,
 * який рендериться стилем ОС і не тримає консистенції з рештою UI.
 *
 * API навмисне схоже на `<Input type="date">`:
 *   value="YYYY-MM-DD"  → onChange("YYYY-MM-DD")
 * Кнопка-тригер показує дату у форматі "21 квіт 2026" і відкриває popover.
 */

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const MONTH_SHORT = [
  "січ", "лют", "бер", "квіт", "трав", "черв",
  "лип", "серп", "вер", "жовт", "лист", "груд",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplay(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

export default function SingleDatePicker({
  value,
  onChange,
  placeholder = "Оберіть дату",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const today = new Date();
  const todayStr = toDateStr(today);
  const anchor = value || todayStr;
  const [y0, m0] = anchor.split("-").map(Number);

  const [viewMonth, setViewMonth] = useState((m0 || today.getMonth() + 1) - 1);
  const [viewYear, setViewYear] = useState(y0 || today.getFullYear());
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // При відкритті перемотати вигляд на місяць поточного value
  useEffect(() => {
    if (!open) return;
    const [yy, mm] = (value || todayStr).split("-").map(Number);
    if (yy && mm) {
      setViewMonth(mm - 1);
      setViewYear(yy);
    }
  }, [open, value, todayStr]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({ date: toDateStr(new Date(y, m, d)), day: d, isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: toDateStr(new Date(viewYear, viewMonth, d)), day: d, isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({ date: toDateStr(new Date(y, m, d)), day: d, isCurrentMonth: false });
    }
    return days;
  }, [viewMonth, viewYear]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-black/10 bg-white text-[16px] text-left px-3.5 h-[44px] flex items-center justify-between cursor-pointer hover:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/10 focus:border-brand-500 transition-colors"
      >
        <span className={value ? "text-gray-900" : "text-gray-400"}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        <svg className="w-4 h-4 text-gray-400 shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[300px] max-w-[calc(100vw-2rem)] bg-white border border-black/[0.08] rounded-2xl shadow-xl p-3 z-50">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f7] cursor-pointer transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[13px] font-semibold text-gray-900">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f7] cursor-pointer transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map((wd) => (
              <div key={wd} className="text-center text-[10px] font-medium text-gray-400 py-1">{wd}</div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 gap-0">
            {calendarDays.map((d, i) => {
              const isSelected = value && d.date === value;
              const isToday = d.date === todayStr;
              let textClass = d.isCurrentMonth ? "text-gray-800" : "text-gray-300";
              let bgClass = "";
              if (isSelected) {
                bgClass = "bg-brand-600";
                textClass = "text-white";
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(d.date); setOpen(false); }}
                  className={`
                    h-8 flex items-center justify-center text-[12px] cursor-pointer transition-all rounded-lg
                    ${bgClass} ${textClass}
                    ${!isSelected ? "hover:bg-[#f5f5f7]" : ""}
                    ${isToday && !isSelected ? "font-bold" : ""}
                  `}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          {/* Quick today */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/5">
            <button
              type="button"
              onClick={() => { onChange(todayStr); setOpen(false); }}
              className="text-[11px] text-brand-600 hover:text-brand-700 px-2 py-1 rounded-md hover:bg-brand-50 cursor-pointer transition-colors"
            >
              Сьогодні
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-gray-400 px-2 py-1 rounded-md hover:bg-[#f5f5f7] cursor-pointer transition-colors"
            >
              Закрити
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
