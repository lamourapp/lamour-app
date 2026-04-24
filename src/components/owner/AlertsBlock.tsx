"use client";

import type { RiskAlert } from "@/app/api/owner/stats/route";
import { useState } from "react";

interface Props {
  alerts: RiskAlert[];
  loading: boolean;
}

const STYLES: Record<RiskAlert["severity"], { bg: string; border: string; text: string; icon: string; iconBg: string }> = {
  critical: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-900",
    icon: "⚠️",
    iconBg: "bg-rose-100",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    icon: "⚡",
    iconBg: "bg-amber-100",
  },
  info: {
    bg: "bg-gray-50",
    border: "border-gray-200",
    text: "text-gray-700",
    icon: "ℹ️",
    iconBg: "bg-gray-100",
  },
};

/**
 * Banner-style alerts (не картка з рамкою) — живе зверху дашборду, одразу
 * під hero-стрічкою. Якщо alerts немає — взагалі не рендеримо (не
 * «порожнього блока»). Якщо є — компактна стрічка з можливістю розгорнути
 * деталі. Severity: critical завжди розгорнуто (важливо), решта згорнуто
 * за замовчуванням щоб не «кричати».
 */
export default function AlertsBlock({ alerts, loading }: Props) {
  const [expanded, setExpanded] = useState<boolean | null>(null); // null = default

  if (loading && alerts.length === 0) return null;
  if (alerts.length === 0) return null;

  const counts = {
    critical: alerts.filter((a) => a.severity === "critical").length,
    warning: alerts.filter((a) => a.severity === "warning").length,
    info: alerts.filter((a) => a.severity === "info").length,
  };

  const defaultExpanded = counts.critical > 0 || alerts.length <= 2;
  const isExpanded = expanded ?? defaultExpanded;

  const topSeverity: RiskAlert["severity"] =
    counts.critical > 0 ? "critical" : counts.warning > 0 ? "warning" : "info";
  const s = STYLES[topSeverity];

  return (
    <div className={`rounded-xl border ${s.bg} ${s.border} mb-3 overflow-hidden`}>
      {/* Compact header — клік розгортає/згортає список */}
      <button
        type="button"
        onClick={() => setExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-3 cursor-pointer hover:bg-black/[0.02] transition-colors"
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[13px] ${s.iconBg}`}>
          {s.icon}
        </div>
        <div className="flex-1 flex items-center gap-3 text-[12px] min-w-0">
          <span className={`font-semibold ${s.text}`}>
            {alerts.length} {pluralize(alerts.length, ["сигнал", "сигнали", "сигналів"])}
          </span>
          <div className="flex items-center gap-2 text-[11px] text-gray-500 truncate">
            {counts.critical > 0 && <span>⚠️ {counts.critical}</span>}
            {counts.warning > 0 && <span>⚡ {counts.warning}</span>}
            {counts.info > 0 && <span>ℹ️ {counts.info}</span>}
          </div>
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{isExpanded ? "▾" : "▸"}</span>
      </button>

      {/* Expanded list — компактні рядки без вкладених карток */}
      {isExpanded && (
        <div className="border-t border-black/[0.05] divide-y divide-black/[0.04]">
          {alerts.map((a) => {
            const as = STYLES[a.severity];
            return (
              <div key={a.id} className="flex gap-3 px-3 py-2 bg-white/40">
                <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 text-[11px] ${as.iconBg}`}>
                  {as.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-medium ${as.text}`}>{a.title}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{a.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
