"use client";

/**
 * Демо-сторінка ролі «Майстер».
 *
 * Мета — показати потенційному салону як виглядатиме PWA для рядового
 * майстра після того, як додамо auth + ролі. Поки auth немає, зверху
 * стоїть селектор «дивитися очима X» — можна перемикатися між існуючими
 * майстрами і бачити їхню картину світу.
 *
 * Свідомо НЕ показуємо:
 *   • власника в селекторі (це не майстер)
 *   • салонну частку / чистий дохід салону
 *   • витрати, оплату оренди, борги інших майстрів
 *   • кнопки редагування чужих записів
 *
 * Коли auth буде реалізовано, ця сторінка стане реальним роутом
 * майстра, а селектор зникне (specialistId підставлятиметься з сесії).
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useJournal, useSpecialists, useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";

type Period = "week" | "month" | "quarter";

const PERIOD_OPTIONS: { id: Period; label: string }[] = [
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
];

/**
 * Частка майстра в конкретному записі — що з нього реально «йде в кишеню».
 * Сюди НЕ входять матеріали салону, % салону, інші внутрішні рухи.
 */
function masterShare(e: JournalEntry): number {
  const serviceShare = e.specialistServiceShare || 0;
  const materialShare = e.specialistMaterialShare || 0;
  const salesShare = e.specialistSalesShare || 0;
  return serviceShare + materialShare + salesShare;
}

function entryTypeLabel(type: JournalEntry["type"]): string {
  switch (type) {
    case "service": return "Послуга";
    case "sale": return "Продаж";
    case "rental": return "Оренда";
    case "debt": return "Розрахунок";
    case "expense": return "Витрата";
    default: return "";
  }
}

function entryTypeDot(type: JournalEntry["type"]): string {
  switch (type) {
    case "service": return "bg-brand-500";
    case "sale": return "bg-emerald-500";
    case "rental": return "bg-amber-500";
    case "debt": return "bg-gray-400";
    case "expense": return "bg-rose-400";
    default: return "bg-gray-300";
  }
}

export default function MasterPreviewPage() {
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  const { specialists, loading: specsLoading } = useSpecialists(false);

  // Тільки активні не-власники — «майстри».
  const masters = useMemo(
    () => specialists.filter((s) => !s.isOwner && s.isActive !== false),
    [specialists],
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("month");

  // Автовибір першого майстра, коли завантажилось.
  const effectiveId = selectedId || masters[0]?.id || "";
  const selected = masters.find((m) => m.id === effectiveId);

  const { entries, loading: journalLoading } = useJournal(period, effectiveId);

  // Фільтруємо на клієнті теж — страхова сітка, раптом API поверне
  // щось лишнє (напр. витрати без specialistId).
  const myEntries = useMemo(
    () => entries.filter((e) => e.specialistId === effectiveId && e.type !== "expense"),
    [entries, effectiveId],
  );

  const periodEarnings = useMemo(
    () => myEntries.reduce((sum, e) => sum + masterShare(e), 0),
    [myEntries],
  );

  const servicesCount = myEntries.filter((e) => e.type === "service" || e.type === "rental").length;
  const salesCount = myEntries.filter((e) => e.type === "sale").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo banner — показуємо, що це не реальний робочий інтерфейс,
          а демонстрація як виглядатиме роль «Майстер». */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-[12px] text-amber-800 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-800 text-[11px] font-semibold">
            ⌖
          </span>
          <span>
            <strong>Демо ролі «Майстер»</strong> · так виглядатиме PWA для рядового спеціаліста
          </span>
        </div>
        <Link
          href="/"
          className="text-[11px] text-amber-700 hover:text-amber-900 underline underline-offset-2"
        >
          ← до адмін-панелі
        </Link>
      </div>

      {/* Selector — тільки для демо. У реальній ролі зникне (майстер
          автоматично = він сам). */}
      <div className="bg-white border-b border-black/[0.06] px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5 font-semibold">
            Дивитися очима
          </div>
          {specsLoading ? (
            <div className="text-[13px] text-gray-400">Завантаження…</div>
          ) : masters.length === 0 ? (
            <div className="text-[13px] text-gray-400">
              Немає активних майстрів для демо. Додайте спеціаліста у Співробітниках.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {masters.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border ${
                    m.id === effectiveId
                      ? "bg-brand-600 text-white border-brand-600"
                      : "bg-white text-gray-700 border-black/10 hover:border-brand-500"
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Master dashboard */}
      {selected && (
        <div className="max-w-3xl mx-auto px-4 py-5 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brand-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-brand-700 font-semibold text-[17px]">{selected.name[0]}</span>
            </div>
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">{selected.name}</h1>
              <div className="text-[12px] text-gray-400">
                {selected.compensationType === "commission" && `Комісія ${selected.serviceCommission}%`}
                {selected.compensationType === "rental" && "Оренда робочого місця"}
                {selected.compensationType === "hourly" && `Погодинна${selected.hourlyRate ? ` · ${fmt(selected.hourlyRate)}/год` : ""}`}
                {selected.compensationType === "salary" && "Зарплата"}
              </div>
            </div>
          </div>

          {/* Period switcher */}
          <div className="flex gap-1.5 bg-white rounded-xl border border-black/[0.06] p-1 w-fit">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                  period === p.id
                    ? "bg-brand-600 text-white"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Earnings card — головне, що бачить майстер. Без салонних
              чисел, без чистого, без витрат. Тільки свій дохід. */}
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl text-white p-5 shadow-sm">
            <div className="text-[11px] uppercase tracking-wider text-brand-100 font-semibold mb-1">
              Мій дохід за період
            </div>
            <div className="text-[32px] font-semibold tabular-nums leading-tight">
              {fmt(periodEarnings)}
            </div>
            <div className="text-[12px] text-brand-100 mt-2 flex gap-4">
              <span>{servicesCount} послуг</span>
              <span>{salesCount} продажів</span>
            </div>
          </div>

          {/* My journal */}
          <div className="bg-white rounded-xl border border-black/[0.06]">
            <div className="px-4 py-3 border-b border-black/5">
              <h2 className="text-[13px] font-semibold text-gray-900">Мої записи</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Послуги та продажі, за які нараховується мій дохід
              </p>
            </div>

            {journalLoading ? (
              <div className="text-center py-12 text-gray-400 text-[13px]">Завантаження…</div>
            ) : myEntries.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-[13px]">
                Немає записів за цей період
              </div>
            ) : (
              <div className="divide-y divide-black/[0.04]">
                {myEntries.map((e) => {
                  const share = masterShare(e);
                  const dateStr = new Date(e.date + "T00:00:00").toLocaleDateString("uk-UA", {
                    day: "2-digit",
                    month: "2-digit",
                  });
                  return (
                    <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${entryTypeDot(e.type)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-gray-900 truncate">{e.title || entryTypeLabel(e.type)}</div>
                        <div className="text-[11px] text-gray-400 flex gap-2">
                          <span>{dateStr}</span>
                          <span>·</span>
                          <span>{entryTypeLabel(e.type)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13px] font-semibold text-gray-900 tabular-nums">
                          {fmt(share)}
                        </div>
                        <div className="text-[10px] text-gray-400">мій дохід</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-[11px] text-gray-400 text-center pt-2">
            У цьому режимі не показуються чужі записи, салонна економіка та витрати.
            Коли з&apos;являться ролі — майстер автоматично потраплятиме сюди при вході.
          </div>
        </div>
      )}
    </div>
  );
}
