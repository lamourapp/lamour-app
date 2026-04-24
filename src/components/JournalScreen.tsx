"use client";

import { useState, useMemo } from "react";
import { useJournal, useSpecialists, useSettings } from "@/lib/hooks";
import type { JournalEntry } from "@/lib/types";
import { moneyFormatter } from "@/lib/format";
import { pluralizeCount } from "@/lib/ua-plural";

type Fmt = (amount: number, opts?: { signed?: boolean; maximumFractionDigits?: number }) => string;
import CalendarPicker from "./CalendarPicker";
import CreateEntryModal from "./CreateEntryModal";
import ServiceEntryModal from "./ServiceEntryModal";
import QuickEditEntryModal from "./QuickEditEntryModal";
import ScrollToTop from "./ScrollToTop";

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
    debt: "розрахунок",
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

function EntryCard({ entry, onDelete, onEdit, onRestore, fmt }: { entry: JournalEntry; onDelete: (id: string) => void; onEdit?: (entry: JournalEntry) => void; onRestore?: (id: string) => void; fmt: Fmt }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isRental = entry.type === "rental";
  const hasMaterials = isRental && entry.materialsCost && entry.materialsCost > 0;
  const hasMultiProducts = entry.saleItems && entry.saleItems.length > 1;
  const isCanceled = !!entry.isCanceled;

  return (
    <div
      className={`bg-white rounded-xl border px-4 py-3 transition-all group relative ${
        isCanceled
          ? "border-dashed border-black/[0.12] opacity-60"
          : "border-black/[0.06] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
      }`}
      onClick={(e) => {
        // Multi-product sale: toggle expand on tap
        if (hasMultiProducts && !confirmDelete) {
          e.preventDefault();
          setExpanded(!expanded);
          return;
        }
        // Скасований запис не відкриває confirmDelete — у нього інші дії (restore).
        if (isCanceled) return;
        // On mobile: tap card to show delete confirm (only if not already showing)
        if (window.innerWidth < 640 && !confirmDelete) {
          e.preventDefault();
          setConfirmDelete(true);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <TypeDot type={entry.type} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-gray-900 truncate flex items-center gap-1.5">
              <span className="truncate">{entry.title || "—"}</span>
              {hasMultiProducts && (
                <span className="inline-flex items-center shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100">
                  {entry.saleItems!.length} {pluralizeCount(entry.saleItems!.length, ["товар", "товари", "товарів"])}
                  <svg className={`w-3 h-3 ml-0.5 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </span>
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              {entry.specialistName && <span>{entry.specialistName}</span>}
              {entry.time && <span>· {entry.time}</span>}
              {!entry.specialistName && entry.type === "expense" && <span>Витрата</span>}
              {entry.source === "bot" && <span className="text-brand-500">· бот</span>}
              {entry.paymentType === "готівка" && (
                <span className="text-gray-500" title="Готівка">· 💵</span>
              )}
              {entry.paymentType === "карта" && (
                <span className="text-gray-500" title="Карта">· 💳</span>
              )}
              {entry.supplement && entry.supplement > 0 && (
                <span className="text-brand-400">· +{entry.supplement}</span>
              )}
              {entry.supplement && entry.supplement < 0 && (
                <span className="text-gray-400">· {entry.supplement}</span>
              )}
            </div>
            {entry.comment && (
              <div className="text-[11px] text-gray-400 mt-0.5 italic truncate">💬 {entry.comment}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={`text-[13px] font-semibold tabular-nums ${
              isRental ? "text-green-600" : "text-gray-900"
            }`}>
              {isRental && "+"}
              {fmt(entry.amount)}
            </div>
            {hasMaterials ? (
              <div className="text-[10px] text-gray-400 tabular-nums leading-tight">
                <span className="text-amber-500">оренда {fmt(entry.amount - entry.materialsCost!)}</span>
                {" + "}
                <span>матер. {fmt(entry.materialsCost!)}</span>
              </div>
            ) : (
              <TypeLabel type={entry.type} />
            )}
          </div>
          {/* Canceled-entry: кнопка «Відновити». Замінює edit/delete — з архіву
              немає сенсу редагувати, спершу відновлюєш. */}
          {isCanceled && onRestore && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(entry.id); }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 cursor-pointer transition-colors whitespace-nowrap"
              title="Відновити скасований запис"
            >
              Відновити
            </button>
          )}
          {/* Edit button — доступний для всіх типів (QuickEditEntryModal
              редагує безпечні метадані; складні зміни = delete+recreate). На
              мобільних завжди видимий, на десктопі — тільки на hover. */}
          {!isCanceled && onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
              className="p-1.5 rounded-lg hover:bg-brand-50 text-gray-300 hover:text-brand-500 cursor-pointer transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
              title="Редагувати запис"
              aria-label="Редагувати запис"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          {/* Desktop only: hover trash icon */}
          {!isCanceled && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 cursor-pointer hidden sm:block"
              title="Скасувати запис"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Expanded sale items */}
      {expanded && hasMultiProducts && (
        <div className="mt-2 pt-2 border-t border-black/[0.04] space-y-1">
          {entry.saleItems!.map((item, i) => (
            <div key={i} className="flex items-center justify-between text-[12px] pl-4">
              <span className="text-gray-600">
                {item.productName}
                {item.quantity > 1 && <span className="text-gray-400"> ×{item.quantity}</span>}
              </span>
              <span className="text-gray-500 tabular-nums">{fmt(item.lineTotal)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div
          className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center gap-3 z-10 border border-red-200"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[12px] text-gray-600">Видалити?</span>
          <button
            onClick={() => { onDelete(entry.id); setConfirmDelete(false); }}
            className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[11px] font-medium cursor-pointer hover:bg-red-600 transition-colors"
          >
            Так
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-medium cursor-pointer hover:bg-gray-200 transition-colors"
          >
            Ні
          </button>
        </div>
      )}
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
  // Показувати скасовані (soft-deleted) записи. OFF за замовчуванням — в журналі
  // видно лише «живі»; вмикається окремим тогглом для перегляду архіву/відновлення.
  const [showCanceled, setShowCanceled] = useState(false);

  const { settings } = useSettings();
  const fmt = useMemo(() => moneyFormatter(settings), [settings]);
  const { entries, loading, error, reload } = useJournal(
    customRange ? "custom" : period,
    selectedSpecialist,
    customRange?.from,
    customRange?.to,
    showCanceled,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [createType, setCreateType] = useState<"expense" | "debt" | "sale" | "service" | null>(null);
  // Quick-edit для будь-якого типу — редагуємо метадані (дата/майстер/коментар)
  // + прості числа (expense amount, debt amount, supplement). Складні зміни
  // (склад продажу, калькуляція послуги) — через delete+recreate.
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      const res = await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      reload();
    } catch (err) {
      console.error(err);
      alert("Не вдалося видалити запис");
    } finally {
      setDeleting(null);
    }
  }

  // Restore = скинути isCanceled у false. Ендпоінт той самий /api/journal DELETE
  // з `restore: true` — щоб не плодити окремий роут для пари "toggle".
  async function handleRestore(id: string) {
    setDeleting(id);
    try {
      const res = await fetch("/api/journal", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, restore: true }),
      });
      if (!res.ok) throw new Error("Failed to restore");
      reload();
    } catch (err) {
      console.error(err);
      alert("Не вдалося відновити запис");
    } finally {
      setDeleting(null);
    }
  }

  // Bulk-restore всіх скасованих записів, видимих у поточному виді (після
  // всіх фільтрів). Послідовно — щоб не перевантажити Airtable rate-limit
  // і щоб у разі помилки половина записів лишалась у consistent стані.
  const [bulkRestoring, setBulkRestoring] = useState(false);
  async function handleBulkRestore(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Відновити ${ids.length} ${ids.length === 1 ? "запис" : "записів"}?`)) return;
    setBulkRestoring(true);
    try {
      for (const id of ids) {
        await fetch("/api/journal", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, restore: true }),
        });
      }
      reload();
    } catch (err) {
      console.error(err);
      alert("Не всі записи вдалося відновити");
    } finally {
      setBulkRestoring(false);
    }
  }
  const { specialists: allSpecialists } = useSpecialists();
  // У селекторах запису НЕ показуємо чистих власників (compensationType=owner) —
  // вони не виконують послуг і не продають. Master-owner (власник + майстер з
  // іншим compensationType) — лишається в списку.
  const specialists = useMemo(
    () => allSpecialists.filter((s) => s.compensationType !== "owner"),
    [allSpecialists],
  );

  // Client-side type filter + «Скасовані» toggle.
  // Семантика кнопки: OFF = тільки активні (API навіть не тягне скасовані),
  // ON = ТІЛЬКИ скасовані (не змішуємо з активними, бо саме в цьому була
  // плутанина — юзер очікував перемикач «показати лише скасовані»).
  const filtered = useMemo(() => {
    let list = showCanceled ? entries.filter((e) => e.isCanceled) : entries;
    if (selectedType) list = list.filter((e) => e.type === selectedType);
    return list;
  }, [entries, selectedType, showCanceled]);

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
      {/* Filters — sticky below nav */}
      <div className="sticky top-12 z-30 -mx-4 px-4 pt-0 pb-2 bg-[#f5f5f7]/80 backdrop-blur-xl">
      <div className="bg-white rounded-2xl border border-black/[0.06] p-3">
        {/* Row 1: period buttons */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5">
              {periodButtons.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPeriod(p.id)}
                  className={`flex-1 px-1 sm:px-3 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all truncate
                    ${period === p.id && !customRange ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                className={`px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer transition-all shrink-0 inline-flex items-center justify-center
                  ${customRange || showCalendar ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                aria-label="Обрати діапазон"
                title="Обрати діапазон"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            {showCalendar && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowCalendar(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-black/[0.08] rounded-2xl shadow-xl p-3 z-50">
                  <CalendarPicker
                    onApply={handleCalendarApply}
                    onClose={() => setShowCalendar(false)}
                    initialFrom={customRange?.from}
                    initialTo={customRange?.to}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        {/* Row 2: specialist + type selects */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1 min-w-0">
            <select
              value={selectedSpecialist}
              onChange={(e) => setSelectedSpecialist(e.target.value)}
              className="appearance-none w-full text-[13px] border border-black/[0.08] rounded-xl pl-3 pr-8 py-2 text-gray-700 bg-white cursor-pointer hover:border-brand-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 truncate"
            >
              <option value="">Всі спеціалісти</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>
          <div className="relative flex-1 min-w-0">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="appearance-none w-full text-[13px] border border-black/[0.08] rounded-xl pl-3 pr-8 py-2 text-gray-700 bg-white cursor-pointer hover:border-brand-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 truncate"
            >
              {typeFilters.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>
          {/* Toggle «Показати скасовані» — компактний перемикач. Підсвічений = ON,
              картки скасованих з'являться в стрічці з опцією «Відновити». */}
          <button
            type="button"
            onClick={() => setShowCanceled((v) => !v)}
            className={`shrink-0 px-2.5 py-2 rounded-xl text-[11px] font-medium cursor-pointer transition-colors border inline-flex items-center gap-1
              ${showCanceled
                ? "bg-brand-50 text-brand-600 border-brand-200"
                : "bg-white text-gray-500 border-black/[0.08] hover:border-brand-300"}`}
            title="Показати скасовані записи"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span className="hidden sm:inline">Скасовані</span>
          </button>
        </div>

      </div>
      </div>{/* end sticky wrapper */}

      {/* Summary */}
      <div className="flex items-center justify-between mb-3 px-0.5 gap-2">
        <h2 className="text-[13px] font-semibold text-gray-900 tracking-tight">
          {periodLabel}
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-gray-400">
          {/* Bulk-restore — лише в режимі «Скасовані», коли є що відновлювати. */}
          {showCanceled && filtered.length > 0 && (
            <button
              type="button"
              onClick={() => handleBulkRestore(filtered.map((e) => e.id))}
              disabled={bulkRestoring}
              className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Відновити всі видимі скасовані записи"
            >
              {bulkRestoring ? "Відновлюю…" : `Відновити всі (${filtered.length})`}
            </button>
          )}
          <span>Записів: <strong className="text-gray-600">{totalRecords}</strong></span>
          <span>Дохід: <strong className="text-gray-900">{fmt(totalIncome, { signed: true })}</strong></span>
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
              <div key={entry.id} className={deleting === entry.id ? "opacity-50 pointer-events-none" : ""}>
                <EntryCard entry={entry} onDelete={handleDelete} onEdit={setEditingEntry} onRestore={handleRestore} fmt={fmt} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Scroll to top */}
      <ScrollToTop />

      {/* Bottom spacer — тримає простір над fixed Quick Add. На мобільному
          додатковий simpler є на рівні page.tsx (pb для bottom-nav). */}
      <div className="h-24" />

      {/* Quick Add Buttons — sm: bottom-6 над footer'ом; mobile: підіймаємо
          над bottom-nav (72px = ~52 nav + 20 відступ). */}
      <div
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-1 sm:gap-1.5 bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg shadow-black/[0.08] p-1 sm:p-1.5 border border-black/5 z-40 max-w-[calc(100vw-24px)]"
      >
        <button
          onClick={() => setCreateType("service")}
          className="bg-brand-600 text-white rounded-[10px] font-medium text-[11px] sm:text-[13px] px-2.5 sm:px-4 py-2 sm:py-2.5 cursor-pointer hover:bg-brand-700 transition-colors whitespace-nowrap"
        >
          + Послуга
        </button>
        <button
          onClick={() => setCreateType("sale")}
          className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[11px] sm:text-[13px] px-2.5 sm:px-4 py-2 sm:py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors whitespace-nowrap"
        >
          + Продаж
        </button>
        <button
          onClick={() => setCreateType("expense")}
          className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[11px] sm:text-[13px] px-2.5 sm:px-4 py-2 sm:py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors whitespace-nowrap"
        >
          + Витрата
        </button>
        <button
          onClick={() => setCreateType("debt")}
          className="bg-[#f5f5f7] text-[#3f3f46] rounded-[10px] font-medium text-[11px] sm:text-[13px] px-2.5 sm:px-4 py-2 sm:py-2.5 border border-black/[0.1] cursor-pointer hover:bg-[#e5e5ea] transition-colors whitespace-nowrap"
          title="Рух коштів з майстром: аванси, борги, виплата ЗП"
        >
          + Розрахунок
        </button>
      </div>

      {/* Create Entry Modals */}
      {createType === "service" && (
        <ServiceEntryModal
          specialists={specialists}
          onClose={() => setCreateType(null)}
          onCreated={reload}
        />
      )}
      {createType && createType !== "service" && (
        <CreateEntryModal
          type={createType}
          specialists={specialists}
          onClose={() => setCreateType(null)}
          onCreated={reload}
        />
      )}

      {/* Service / rental — повноцінний ServiceEntryModal в edit-mode
          (create-new + cancel-old). Інші типи — легкий QuickEditEntryModal. */}
      {editingEntry && (editingEntry.type === "service" || editingEntry.type === "rental") && (
        <ServiceEntryModal
          specialists={specialists}
          onClose={() => setEditingEntry(null)}
          onCreated={reload}
          initial={{
            replaceEntryId: editingEntry.id,
            date: editingEntry.date,
            specialistId: editingEntry.specialistId,
            serviceId: editingEntry.serviceId,
            supplement: editingEntry.supplement,
            extraHours: editingEntry.extraHours,
            comment: editingEntry.comment,
            calcMaterials: editingEntry.calcMaterials,
            paymentType: editingEntry.paymentType,
          }}
        />
      )}
      {/* Sale — повний CreateEntryModal у edit-mode (create-new + cancel-old),
          щоб дозволити редагування складу продажу. Метадані для інших типів
          (expense/debt) — легкий QuickEditEntryModal. */}
      {editingEntry && editingEntry.type === "sale" && (
        <CreateEntryModal
          type="sale"
          specialists={specialists}
          onClose={() => setEditingEntry(null)}
          onCreated={reload}
          initial={{
            id: editingEntry.id,
            replaceEntryId: editingEntry.id,
            date: editingEntry.date,
            specialistId: editingEntry.specialistId,
            comment: editingEntry.comment,
            saleItems: editingEntry.saleItems?.map((si) => ({
              productId: si.productId,
              quantity: si.quantity,
            })),
            supplement: editingEntry.supplement,
            paymentType: editingEntry.paymentType,
          }}
        />
      )}
      {editingEntry && editingEntry.type !== "service" && editingEntry.type !== "rental" && editingEntry.type !== "sale" && (
        <QuickEditEntryModal
          entry={editingEntry}
          specialists={specialists}
          onClose={() => setEditingEntry(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
