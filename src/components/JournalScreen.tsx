"use client";

import { useState } from "react";
import { useJournal, useSpecialists } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/demo-data";

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
  const isExpense = entry.type === "expense";
  const isRental = entry.type === "rental";

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TypeDot type={entry.type} />
          <div>
            <div className="text-[13px] font-medium text-gray-900">{entry.title || "—"}</div>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              {entry.specialistName && <span>{entry.specialistName}</span>}
              {entry.time && <span>· {entry.time}</span>}
              {!entry.specialistName && isExpense && <span>Витрата</span>}
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
        <div className="text-right shrink-0">
          <div className={`text-[13px] font-semibold tabular-nums ${
            isRental ? "text-green-600" : isExpense ? "text-gray-900" : "text-gray-900"
          }`}>
            {isRental && "+"}
            {entry.amount < 0 ? "−" : ""}
            {Math.abs(entry.amount).toLocaleString("uk-UA")} ₴
          </div>
          <TypeLabel type={entry.type} />
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
  const year = date.getFullYear();
  return `${day} ${months[date.getMonth()]} ${year}, ${weekdays[date.getDay()]}`;
}

const periods = [
  { id: "yesterday", label: "Вчора" },
  { id: "today", label: "Сьогодні" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
];

export default function JournalScreen() {
  const [period, setPeriod] = useState("month");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");
  const { entries, loading, error } = useJournal(period, selectedSpecialist);
  const { specialists } = useSpecialists();

  // Group entries by date
  const grouped = entries.reduce<Record<string, JournalEntry[]>>((acc, entry) => {
    const date = entry.date || "unknown";
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Calculate totals
  const totalIncome = entries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalRecords = entries.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-3 mb-4">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-1">
            {periods.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                  ${period === p.id ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
              >
                {p.label}
              </button>
            ))}
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
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mb-3 px-0.5">
        <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
          {period === "today" ? "Сьогодні" : period === "yesterday" ? "Вчора" : period === "week" ? "Цей тиждень" : "Цей місяць"}
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
      {!loading && !error && entries.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Немає записів за цей період</div>
      )}

      {/* Journal entries grouped by date */}
      {!loading && dates.map((date, dateIdx) => (
        <div key={date}>
          {dateIdx > 0 && (
            <div className="flex items-center gap-3 pt-3 pb-1 px-0.5">
              <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
                {formatDateHeader(date)}
              </h2>
              <div className="flex-1 h-px bg-black/5" />
            </div>
          )}
          {dateIdx === 0 && dates.length > 1 && (
            <div className="flex items-center gap-3 pb-1 px-0.5">
              <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
                {formatDateHeader(date)}
              </h2>
              <div className="flex-1 h-px bg-black/5" />
            </div>
          )}
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
