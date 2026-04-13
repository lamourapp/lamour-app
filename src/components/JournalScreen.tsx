"use client";

import { journalEntries, type JournalEntry } from "@/lib/demo-data";

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

function SourceBadge({ source }: { source?: string }) {
  if (!source) return null;
  if (source === "bot") return <span className="text-brand-500">бот</span>;
  return null;
}

function SupplementBadge({ value }: { value?: number }) {
  if (!value) return null;
  const isPositive = value > 0;
  return (
    <span className={isPositive ? "text-brand-400" : "text-gray-400"}>
      {isPositive ? `+${value}` : value}
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
            <div className="text-[13px] font-medium text-gray-900">{entry.title}</div>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
              {entry.specialistName && <span>{entry.specialistName}</span>}
              {entry.time && <span>· {entry.time}</span>}
              {!entry.specialistName && !entry.time && entry.type === "expense" && (
                <span>Витрата</span>
              )}
              {isRental && entry.specialistName && <span>· квітень</span>}
              <SourceBadge source={entry.source} />
              <SupplementBadge value={entry.supplement} />
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[13px] font-semibold tabular-nums ${
            isRental ? "text-green-600" : "text-gray-900"
          }`}>
            {isRental && "+"}
            {Math.abs(entry.amount).toLocaleString("uk-UA")} ₴
          </div>
          <TypeLabel type={entry.type} />
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = date.getDate();
  const months = [
    "січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
  ];
  const weekdays = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
  return `${day} ${months[date.getMonth()]} 2026, ${weekdays[date.getDay()]}`;
}

export default function JournalScreen() {
  // Group entries by date
  const grouped = journalEntries.reduce<Record<string, JournalEntry[]>>((acc, entry) => {
    if (!acc[entry.date]) acc[entry.date] = [];
    acc[entry.date].push(entry);
    return acc;
  }, {});

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const firstDate = dates[0];

  // Calculate today's summary
  const todayEntries = grouped[firstDate] || [];
  const todayIncome = todayEntries
    .filter((e) => e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-black/[0.06] p-3 mb-4">
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex gap-1">
            {["Вчора", "Сьогодні", "Тиждень", "Місяць", "📅"].map((label, i) => (
              <button
                key={label}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium cursor-pointer transition-all
                  ${i === 1 ? "bg-brand-600 text-white" : "bg-[#f5f5f7] text-gray-600 hover:bg-[#e5e5ea]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-black/5 hidden sm:block" />
          <select className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer">
            <option>Всі спеціалісти</option>
            <option>Соломія</option>
            <option>Леся Шевчук</option>
            <option>Лєна Громик</option>
            <option>Іра</option>
            <option>Юля манікюр</option>
            <option>Крістіна</option>
            <option>Артур</option>
            <option>Андрій</option>
            <option>Антон</option>
          </select>
          <select className="text-[11px] border border-black/[0.08] rounded-lg px-2.5 py-1.5 text-gray-600 bg-white cursor-pointer">
            <option>Всі типи</option>
            <option>Послуги</option>
            <option>Продажі</option>
            <option>Витрати</option>
            <option>Борги</option>
          </select>
        </div>
      </div>

      {/* Journal entries grouped by date */}
      {dates.map((date, dateIdx) => (
        <div key={date}>
          {dateIdx === 0 ? (
            <div className="flex items-center justify-between mb-3 px-0.5">
              <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
                {formatDate(date)}
              </h2>
              <div className="flex gap-3 text-[11px] text-gray-400">
                <span>
                  Записів: <strong className="text-gray-600">{todayEntries.length}</strong>
                </span>
                <span>
                  Дохід: <strong className="text-gray-900">+{todayIncome.toLocaleString("uk-UA")} ₴</strong>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 pt-3 pb-1 px-0.5">
              <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
                {formatDate(date)}
              </h2>
              <div className="flex-1 h-px bg-black/5" />
            </div>
          )}
          <div className="space-y-1.5">
            {grouped[date].map((entry) => (
              <EntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}

      {/* Bottom spacer for floating buttons */}
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
