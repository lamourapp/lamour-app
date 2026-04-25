"use client";

import { useState, useMemo } from "react";

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
];

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: string, b: string): boolean {
  return a === b;
}

function isInRange(day: string, from: string, to: string): boolean {
  return day >= from && day <= to;
}

interface CalendarPickerProps {
  onApply: (from: string, to: string) => void;
  onClose: () => void;
  initialFrom?: string;
  initialTo?: string;
}

export default function CalendarPicker({ onApply, onClose, initialFrom, initialTo }: CalendarPickerProps) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [rangeFrom, setRangeFrom] = useState(initialFrom || "");
  const [rangeTo, setRangeTo] = useState(initialTo || "");
  const [selecting, setSelecting] = useState<"from" | "to">("from");

  // Build calendar grid for current view month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    // Monday = 0, Sunday = 6
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const m = viewMonth === 0 ? 11 : viewMonth - 1;
      const y = viewMonth === 0 ? viewYear - 1 : viewYear;
      days.push({
        date: toDateStr(new Date(y, m, d)),
        day: d,
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: toDateStr(new Date(viewYear, viewMonth, d)),
        day: d,
        isCurrentMonth: true,
      });
    }

    // Next month padding (fill to 42 = 6 rows)
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const m = viewMonth === 11 ? 0 : viewMonth + 1;
      const y = viewMonth === 11 ? viewYear + 1 : viewYear;
      days.push({
        date: toDateStr(new Date(y, m, d)),
        day: d,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [viewMonth, viewYear]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function handleDayClick(dateStr: string) {
    if (selecting === "from") {
      setRangeFrom(dateStr);
      setRangeTo("");
      setSelecting("to");
    } else {
      if (dateStr < rangeFrom) {
        // If clicked date is before start, restart
        setRangeFrom(dateStr);
        setRangeTo("");
        setSelecting("to");
      } else {
        setRangeTo(dateStr);
        setSelecting("from");
      }
    }
  }

  function handleApply() {
    if (rangeFrom && rangeTo) {
      onApply(rangeFrom, rangeTo);
    }
  }

  // Quick presets
  function applyPreset(preset: string) {
    const now = new Date();
    let from = "";
    let to = toDateStr(now);

    switch (preset) {
      case "thisMonth": {
        from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        to = toDateStr(now);
        break;
      }
      case "lastMonth": {
        const lastM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        from = toDateStr(lastM);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
        to = toDateStr(lastDay);
        break;
      }
      case "last30": {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        from = toDateStr(d);
        to = toDateStr(now);
        break;
      }
      case "last90": {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        from = toDateStr(d);
        to = toDateStr(now);
        break;
      }
    }

    setRangeFrom(from);
    setRangeTo(to);
    setSelecting("from");

    // Navigate view to the "from" month
    const fromDate = new Date(from);
    setViewMonth(fromDate.getMonth());
    setViewYear(fromDate.getFullYear());
  }

  const todayStr = toDateStr(today);

  return (
    <div className="mt-3 pt-3 border-t border-black/5">
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {[
          { id: "thisMonth", label: "Цей місяць" },
          { id: "lastMonth", label: "Мин. місяць" },
          { id: "last30", label: "30 днів" },
          { id: "last90", label: "90 днів" },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => applyPreset(p.id)}
            className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-[#f5f5f7] text-gray-500 hover:bg-[#e5e5ea] cursor-pointer transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button
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
          onClick={nextMonth}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f5f5f7] cursor-pointer transition-colors"
        >
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-[10px] font-medium text-gray-400 py-1">
            {wd}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0">
        {calendarDays.map((d, i) => {
          const isFrom = rangeFrom && isSameDay(d.date, rangeFrom);
          const isTo = rangeTo && isSameDay(d.date, rangeTo);
          const inRange = rangeFrom && rangeTo && isInRange(d.date, rangeFrom, rangeTo);
          const isToday = isSameDay(d.date, todayStr);

          let bgClass = "";
          let textClass = d.isCurrentMonth ? "text-gray-800" : "text-gray-300";

          if (isFrom || isTo) {
            bgClass = "bg-brand-600";
            textClass = "text-white";
          } else if (inRange) {
            bgClass = "bg-brand-50";
            textClass = "text-brand-700";
          }

          return (
            <button
              key={i}
              onClick={() => handleDayClick(d.date)}
              className={`active:scale-[0.97] h-8 flex items-center justify-center text-[12px] cursor-pointer transition-all
                ${bgClass}
                ${textClass}
                ${isFrom ? "rounded-l-lg" : ""}
                ${isTo ? "rounded-r-lg" : ""}
                ${isFrom && !rangeTo ? "rounded-lg" : ""}
                ${!isFrom && !isTo && !inRange ? "hover:bg-[#f5f5f7] rounded-lg" : ""}
                ${isToday && !isFrom && !isTo ? "font-bold" : ""}`}
            >
              {d.day}
            </button>
          );
        })}
      </div>

      {/* Selected range display + Apply */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-black/5">
        <div className="text-[11px] text-gray-400">
          {rangeFrom && rangeTo ? (
            <span>
              {rangeFrom.split("-").reverse().join(".")} — {rangeTo.split("-").reverse().join(".")}
            </span>
          ) : rangeFrom ? (
            <span className="text-brand-500">Оберіть кінцеву дату</span>
          ) : (
            <span>Оберіть початкову дату</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="text-[11px] text-gray-400 px-3 py-1.5 rounded-lg hover:bg-[#f5f5f7] cursor-pointer transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={handleApply}
            disabled={!rangeFrom || !rangeTo}
            className="bg-brand-600 text-white rounded-lg text-[11px] font-medium px-3 py-1.5 cursor-pointer hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Застосувати
          </button>
        </div>
      </div>
    </div>
  );
}
