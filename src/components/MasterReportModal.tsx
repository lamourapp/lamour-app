"use client";

import { useMemo, useState } from "react";
import CalendarPicker from "./CalendarPicker";
import type { Specialist } from "@/lib/types";

/**
 * Модал запуску звіту ЗП майстра за період.
 *
 * Власник обирає період (день / тиждень / місяць / квартал / свій діапазон),
 * далі відкриває або копіює лінк. Звіт живе на публічному URL
 * /report/master/[id]?from=...&to=... — достатньо обскурно для MVP.
 */

interface Props {
  specialist: Specialist;
  onClose: () => void;
}

type Preset = "today" | "week" | "month" | "quarter" | "custom";

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presetRange(p: Exclude<Preset, "custom">): { from: string; to: string } {
  const today = new Date();
  const to = toDateStr(today);
  if (p === "today") return { from: to, to };
  if (p === "week") {
    // Пн-Нд. getDay(): 0 = Нд.
    const dow = today.getDay();
    const diff = dow === 0 ? 6 : dow - 1;
    const mon = new Date(today);
    mon.setDate(today.getDate() - diff);
    return { from: toDateStr(mon), to };
  }
  if (p === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateStr(first), to };
  }
  // quarter
  const q = Math.floor(today.getMonth() / 3);
  const first = new Date(today.getFullYear(), q * 3, 1);
  return { from: toDateStr(first), to };
}

function fmtDate(s: string): string {
  return s.split("-").reverse().join(".");
}

export default function MasterReportModal({ specialist, onClose }: Props) {
  const [preset, setPreset] = useState<Preset>("month");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [copied, setCopied] = useState(false);

  const range = useMemo(() => {
    if (preset === "custom" && customRange) return customRange;
    if (preset === "custom") return null;
    return presetRange(preset);
  }, [preset, customRange]);

  const reportUrl = useMemo(() => {
    if (!range) return "";
    if (typeof window === "undefined") return "";
    const base = window.location.origin;
    return `${base}/report/master/${specialist.id}?from=${range.from}&to=${range.to}`;
  }, [range, specialist.id]);

  function handleOpen() {
    if (!reportUrl) return;
    window.open(reportUrl, "_blank", "noopener");
  }

  async function handleCopy() {
    if (!reportUrl) return;
    try {
      await navigator.clipboard.writeText(reportUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  const presetButtons: { id: Preset; label: string }[] = [
    { id: "today", label: "День" },
    { id: "week", label: "Тиждень" },
    { id: "month", label: "Місяць" },
    { id: "quarter", label: "Квартал" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center px-0 sm:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[11px] text-gray-400 uppercase tracking-wider">Звіт ЗП</div>
            <div className="text-[15px] font-semibold text-gray-900 truncate">{specialist.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center cursor-pointer"
            aria-label="Закрити"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-2">Період</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presetButtons.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPreset(p.id); setCustomRange(null); setShowCalendar(false); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer
                  ${preset === p.id && !customRange ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setPreset("custom"); setShowCalendar((v) => !v); }}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5
                ${preset === "custom" ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {customRange ? `${fmtDate(customRange.from)}—${fmtDate(customRange.to)}` : "Діапазон"}
            </button>
          </div>

          {showCalendar && (
            <div className="mb-3 border border-black/[0.08] rounded-2xl p-3">
              <CalendarPicker
                onApply={(from, to) => {
                  setCustomRange({ from, to });
                  setPreset("custom");
                  setShowCalendar(false);
                }}
                onClose={() => setShowCalendar(false)}
                initialFrom={customRange?.from}
                initialTo={customRange?.to}
              />
            </div>
          )}

          {range && (
            <div className="bg-gray-50 rounded-xl px-3 py-2.5 mb-4">
              <div className="text-[11px] text-gray-400 uppercase tracking-wider">Діапазон</div>
              <div className="text-[13px] font-medium text-gray-900 tabular-nums">
                {fmtDate(range.from)} — {fmtDate(range.to)}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={!range}
              onClick={handleOpen}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white font-medium text-[13px] hover:bg-brand-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Відкрити звіт
            </button>
            <button
              type="button"
              disabled={!range}
              onClick={handleCopy}
              className="w-full py-2.5 rounded-xl bg-brand-50 text-brand-600 border border-brand-200 font-medium text-[13px] hover:bg-brand-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {copied ? "Посилання скопійовано" : "Скопіювати посилання"}
            </button>
          </div>

          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Посилання публічне — за ним може відкрити звіт будь-хто,
            кому ви його надішлете. PIN не потрібен.
          </p>
        </div>
      </div>
    </div>
  );
}
