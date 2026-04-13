"use client";

import { useState, useMemo } from "react";
import { useJournal, useSpecialists } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/demo-data";
import CalendarPicker from "./CalendarPicker";

function TypeDot({ type }: { type: JournalEntry["type"] }) {
  const colors: Record<string, string> = {
    service: "bg-brand-400",
    sale: "bg-emerald-400",
    expense: "bg-gray-300",
    rental: "bg-amber-400",
    debt: "bg-red-400",
  };
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colors[type] || "bg-gray-300"}`} />;
}

function TypeLabel({ type }: { type: JournalEntry["type"] }) {
  const labels: Record<string, string> = {
    service: "послуга",
    sale: "продаж",
    expense: "витрата",
    rental: "оренда",
    debt: "борг",
  };
  const colors: Record<string, string> = {
    service: "text-gray-400",
    sale: "text-emerald-500",
    expense: "text-gray-400",
    rental: "text-amber-500",
    debt: "text-red-500",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider ${colors[type] || "text-gray-400"}`}>
      {labels[type] || type}
    </span>
  );
}

function EntryCard({ entry }: { entry: JournalEntry }) {
  const isRental = entry.type === "rental";
  const hasMaterials = isRental && entry.materialsCost && entry.materialsCost > 0;

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <TypeDot type={entry.type} />
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-900 truncate">{entry.title || "—"}</div>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              {entry.specialistName && <span>{entry.specialistName}</span>}
              {entry.time && <span>· {entry.time}</span>}
              {!entry.specialistName && entry.type === "expense" && <span>Витрата</span>}
              {entry.source === "bot" && <span className="text-brand-500">· бот</span>}
              {entry.supplement && entry.supplement > 0 && (
                <span className="text-brand-400">· +{entry.supplement}</span>
              )}
              {entry.supplement && entry.supplement < 0 && (
                <span className="text-gray-400">· {entry.supplement}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0 ml-3">
          <div className={`text-[13px] font-semibold tabular-nums ${
            isRental ? "text-green-600" : "text-gray-900"
          }`}>
            {isRental && "+"}
            {entry.amount < 0 ? "−" : ""}
            {Math.abs(entry.amount).toLocaleString("uk-UA")} ₴
          </div>
          {hasMaterials ? (
            <div className="text-[10px] text-gray-400 tabular-nums leading-tight">
              <span className="text-amber-500">оренда {(entry.amount - entry.materialsCost!).toLocaleString("uk-UA")}</span>
              {" + "}
              <span>матер. {entry.materialsCost!.toLocaleString("uk-UA")}</span>
            </div>
          ) : (
            <TypeLabel type={entry.type} />
          )}
        </div>
      </div>
    </div>
  );
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDate();
  const months = [
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
  ];
  const weekdays = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}, ${weekdays[date.getDay()]}`;
}

const periodButtons = [
  { id: "yesterday", label: "Вчора" },
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
];

const typeFilters = [
  { id: "", label: "Всі типи" },
  { id: "service", label: "Послуги" },
  { id: "sale", label: "Продажі" },
  { id: "expense", label: "Витрати" },
  { id: "debt", label: "Борги" },
  { id: "rental", label: "Оренда" },
];

export default function JournalScreen() {
  const [period, setPeriod] = useState("month");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);

  const { entries, loading, error } = useJournal(
    customRange ? "custom" : period,
    selectedSpecialist,
    customRange?.from,
    customRange?.to,
  );
  const { specialists } = useSpecialists();

  // Client-side type filter
  const filtered = useMemo(() => {
    if (!selectedType) return entries;
    return entries.filter((e) => e.type === selectedType);
  }, [entries, selectedType]);

  // Group entries by date
  const grouped = filtered.reduce<Record<string, JournalEntry[]>>((acc, entry) => {
    const date = entry.date || "unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Calculate totals
  const totalIncome = filtered
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalRecords = filtered.length;

  function selectPeriod(p: string) {
    setPeriod(p);
    setCustomRange(null);
    setShowCalendar(false);
  }

  function handleCalendarApply(from: string, to: string) {
    setCustomRange({ from, to });
    setPeriod("");
    setShowCalendar(false);
  }

  const periodLabel = customRange
    ? `${customRange.from} — ${customRange.to}`
    : period === "today" ? "Сьогодні"
    : period === "yesterday" ? "Вчора"
    : period === "week" ? "Цей тиждень"
    : "Цей місяць";

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-3 mb-4">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-1">
            {periodButtons.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPeriod(p.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                  ${period === p.id && !customRange ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowCalendar(!showCalendar)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                ${customRange ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
            >
              📅
            </button>
          </div>
          <div className="h-5 w-px bg-black/5 hidden sm:block" />
          <select
            value={selectedSpecialist}
            onChange={(e) => setSelectedSpecialist(e.target.value)}
            className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer"
          >
            <option value="">Всі спеціалісти</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer"
          >
            {typeFilters.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Calendar picker */}
        {showCalendar && (
          <CalendarPicker
            onApply={handleCalendarApply}
            onClose={() => setShowCalendar(false)}
            initialFrom={customRange?.from}
            initialTo={customRange?.to}
          />
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
          {periodLabel}
        </h2>
        <div className="flex gap-3 text-[11px] text-gray-400">
          <span>Записів: <strong className="text-gray-600">{totalRecords}</strong></span>
          <span>Дохід: <strong className="text-gray-900">+{totalIncome.toLocaleString("uk-UA")} ₴</strong></span>
        </div>
      </div>

      {/* Loading / Error / Empty */}
      {loading && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Завантаження...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-[13px]">Помилка: {error}</div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Немає записів за цей період</div>
      )}

      {/* Journal entries grouped by date */}
      {!loading && dates.map((date, dateIdx) => (
        <div key={date}>
          <div className={`flex items-center gap-3 px-0.5 ${dateIdx > 0 ? "pt-3" : ""} pb-1`}>
            <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
              {formatDateHeader(date)}
            </h2>
            <div className="flex-1 h-px bg-black/5" />
            <span className="text-[11px] text-gray-400">{grouped[date].length}</span>
          </div>
          <div className="space-y-1.5 mb-1">
            {grouped[date].map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}

      {/* Bottom spacer */}
      <div className="h-24" />

      {/* Quick Add Buttons */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-black/[0.08] p-1.5 border border-black/5 z-40">
        <button className="bg-brand-600 text-white rounded-[10px] font-medium text-[13px] px-4 py-2.5 cursor-pointer hover:bg-brand-700 transition-colors">
          + Послуга
        </button>
        <button className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[13px] px-4 py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors">
          + Продаж
        </button>
        <button className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[13px] px-4 py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors">
          + Витрата
        </button>
        <button className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[13px] px-4 py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors hidden sm:block">
          + Борг
        </button>
      </div>
    </div>
  );
}
