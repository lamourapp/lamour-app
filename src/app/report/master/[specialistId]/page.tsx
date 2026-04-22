"use client";

/**
 * Публічна сторінка звіту ЗП майстра за період.
 *
 * Відкривається власником, передається майстру лінком у Viber/Telegram.
 * Немає PIN — безпека через obscurity лінка (specialistId + from + to
 * знає тільки той, кому відправили).
 *
 * Дизайн: мобільно-першорядний, без емодзі, максимально чисто. Мета —
 * щоб майстер відкрив у телефоні і одразу бачив «скільки мені».
 */

import { use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatMoney, localeFromTimezone } from "@/lib/format";

interface ReportData {
  salon: {
    name: string;
    currency: "UAH" | "USD" | "EUR" | "PLN";
    timezone: string;
    specialistTerm: string;
    brandColor: string;
  };
  specialist: {
    id: string;
    name: string;
    compensationLabel: string;
  };
  period: { from: string; to: string };
  accrued: {
    services: number;
    materials: number;
    sales: number;
    total: number;
    countServices: number;
    countSales: number;
  };
  paid: { total: number; count: number };
  contributed: { total: number };
  remaining: number;
  entries: {
    id: string;
    date: string;
    type: "service" | "sale" | "rental" | "debt" | "expense" | "";
    title: string;
    amount: number;
    comment: string;
  }[];
  generatedAt: string;
}

function formatDMY(iso: string, locale: string): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  return d.toLocaleDateString(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateShort(iso: string, locale: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

function entryTypeLabel(type: string): string {
  switch (type) {
    case "service":
      return "Послуга";
    case "sale":
      return "Продаж";
    case "rental":
      return "Оренда";
    case "debt":
      return "Розрахунок";
    default:
      return "";
  }
}

function entryTypeDot(type: string): string {
  switch (type) {
    case "service":
      return "bg-brand-500";
    case "sale":
      return "bg-emerald-500";
    case "rental":
      return "bg-amber-500";
    case "debt":
      return "bg-gray-400";
    default:
      return "bg-gray-300";
  }
}

// Apply brand color as CSS var — так Tailwind brand-* класи підтягнуть
// колір салону. Без цього буде дефолтний фіолетовий.
function applyBrandColor(hex: string) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty("--brand-600", hex);
}

export default function MasterReportPage({
  params,
}: {
  params: Promise<{ specialistId: string }>;
}) {
  const { specialistId } = use(params);
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";

  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!specialistId || !from || !to) {
      setError("Невірне посилання — відсутні параметри періоду.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/report/master?specialistId=${encodeURIComponent(
        specialistId,
      )}&from=${from}&to=${to}`,
    )
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<ReportData>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        applyBrandColor(d.salon.brandColor);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Помилка");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specialistId, from, to]);

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = data
      ? `Звіт ЗП · ${data.specialist.name}`
      : "Звіт";
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // fallthrough → copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-[13px] text-gray-400">Завантаження…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-black/[0.06] p-6 max-w-sm text-center">
          <div className="text-[13px] text-rose-600 mb-2">
            Не вдалося завантажити звіт
          </div>
          <div className="text-[12px] text-gray-500">
            {error || "Дані недоступні"}
          </div>
        </div>
      </div>
    );
  }

  const locale = localeFromTimezone(data.salon.timezone);
  const fmt = (n: number, opts?: { signed?: boolean }) =>
    formatMoney(n, data.salon.currency, { ...opts, locale });

  // Групуємо записи по даті для красивого списку.
  const entriesByDate = new Map<string, ReportData["entries"]>();
  for (const e of data.entries) {
    const list = entriesByDate.get(e.date) || [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }
  const dateKeys = Array.from(entriesByDate.keys()).sort().reverse();

  const hasContributed = data.contributed.total > 0;
  const hasPaid = data.paid.total > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* Header */}
        <div className="text-center pt-2">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
            {data.salon.name}
          </div>
          <h1 className="text-[22px] font-semibold text-gray-900 mt-1">
            Звіт за період
          </h1>
          <div className="text-[12px] text-gray-500 mt-0.5">
            {formatDMY(data.period.from, locale)} — {formatDMY(data.period.to, locale)}
          </div>
        </div>

        {/* Master card */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
            <span className="text-brand-700 font-semibold text-[17px]">
              {data.specialist.name[0]}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-gray-900 truncate">
              {data.specialist.name}
            </div>
            {data.specialist.compensationLabel && (
              <div className="text-[11px] text-gray-500 truncate">
                {data.specialist.compensationLabel}
              </div>
            )}
          </div>
        </div>

        {/* Accrued — головний блок */}
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl text-white p-5 shadow-sm">
          <div className="text-[11px] uppercase tracking-wider text-brand-100 font-semibold">
            Нараховано за період
          </div>
          <div className="text-[34px] font-semibold tabular-nums leading-tight mt-1">
            {fmt(data.accrued.total)}
          </div>
          <div className="mt-3 pt-3 border-t border-white/15 space-y-1">
            {data.accrued.services > 0 && (
              <div className="flex justify-between text-[12px] text-brand-100">
                <span>Послуги ({data.accrued.countServices} шт)</span>
                <span className="tabular-nums">{fmt(data.accrued.services)}</span>
              </div>
            )}
            {data.accrued.materials > 0 && (
              <div className="flex justify-between text-[12px] text-brand-100">
                <span>Матеріали у послугах</span>
                <span className="tabular-nums">{fmt(data.accrued.materials)}</span>
              </div>
            )}
            {data.accrued.sales > 0 && (
              <div className="flex justify-between text-[12px] text-brand-100">
                <span>Продаж товарів ({data.accrued.countSales} шт)</span>
                <span className="tabular-nums">{fmt(data.accrued.sales)}</span>
              </div>
            )}
            {data.accrued.total === 0 && (
              <div className="text-[12px] text-brand-100 text-center py-2">
                За цей період нарахувань немає
              </div>
            )}
          </div>
        </div>

        {/* Paid + Remaining */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-5 space-y-3">
          <div className="flex justify-between items-baseline">
            <div>
              <div className="text-[13px] text-gray-700">Виплачено</div>
              <div className="text-[11px] text-gray-400">
                {data.paid.count > 0
                  ? `${data.paid.count} виплат`
                  : "Виплат не було"}
              </div>
            </div>
            <div className="text-[18px] font-semibold text-gray-900 tabular-nums">
              {hasPaid ? fmt(-data.paid.total) : fmt(0)}
            </div>
          </div>

          {hasContributed && (
            <div className="flex justify-between items-baseline pt-2 border-t border-black/5">
              <div className="text-[12px] text-gray-600">Довнесено</div>
              <div className="text-[14px] font-medium text-emerald-600 tabular-nums">
                {fmt(data.contributed.total, { signed: true })}
              </div>
            </div>
          )}

          <div className="flex justify-between items-baseline pt-3 border-t-2 border-black/10">
            <div className="text-[13px] font-semibold text-gray-900">
              Залишок до виплати
            </div>
            <div
              className={`text-[22px] font-semibold tabular-nums ${
                data.remaining > 0
                  ? "text-brand-600"
                  : data.remaining < 0
                    ? "text-rose-500"
                    : "text-gray-400"
              }`}
            >
              {fmt(data.remaining)}
            </div>
          </div>
        </div>

        {/* Entries list */}
        {data.entries.length > 0 && (
          <div className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
            <div className="px-4 py-3 border-b border-black/5">
              <h2 className="text-[13px] font-semibold text-gray-900">
                Деталізація
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Всі записи за період, згруповані по днях
              </p>
            </div>

            {dateKeys.map((date) => {
              const list = entriesByDate.get(date)!;
              const daySum = list
                .filter((e) => e.type !== "debt")
                .reduce((s, e) => s + e.amount, 0);
              return (
                <div key={date} className="border-b border-black/5 last:border-0">
                  <div className="px-4 py-2 bg-gray-50/60 flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      {formatDateShort(date, locale)}
                    </div>
                    {daySum > 0 && (
                      <div className="text-[11px] text-gray-500 tabular-nums">
                        разом {fmt(daySum)}
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-black/[0.04]">
                    {list.map((e) => (
                      <div
                        key={e.id}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${entryTypeDot(e.type)}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] text-gray-900 truncate">
                            {e.title || entryTypeLabel(e.type)}
                          </div>
                          {e.comment && (
                            <div className="text-[11px] text-gray-400 truncate">
                              {e.comment}
                            </div>
                          )}
                        </div>
                        <div
                          className={`text-[13px] font-semibold tabular-nums shrink-0 ${
                            e.type === "debt" && e.amount < 0
                              ? "text-rose-500"
                              : e.type === "debt" && e.amount > 0
                                ? "text-emerald-600"
                                : "text-gray-900"
                          }`}
                        >
                          {e.type === "debt"
                            ? fmt(e.amount, { signed: true })
                            : fmt(e.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Share + footer */}
        <div className="pt-2 space-y-3">
          <button
            type="button"
            onClick={handleShare}
            className="w-full bg-brand-600 text-white rounded-xl py-3 text-[14px] font-medium cursor-pointer hover:bg-brand-700 transition-colors shadow-sm"
          >
            {copied ? "Посилання скопійовано" : "Поділитись звітом"}
          </button>
          <div className="text-center text-[10px] text-gray-400">
            Сформовано{" "}
            {new Date(data.generatedAt).toLocaleDateString(locale, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}{" "}
            · {data.salon.name}
          </div>
        </div>
      </div>
    </div>
  );
}
