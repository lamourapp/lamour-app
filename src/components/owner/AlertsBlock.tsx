"use client";

import type { RiskAlert } from "@/app/api/owner/stats/route";

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

export default function AlertsBlock({ alerts, loading }: Props) {
  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Ризики та сигнали</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Автоматичні перевірки за поточний період
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      <div className="space-y-2">
        {alerts.map((a) => {
          const s = STYLES[a.severity];
          return (
            <div
              key={a.id}
              className={`flex gap-3 rounded-lg border ${s.bg} ${s.border} p-3`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[14px] ${s.iconBg}`}>
                {s.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-[12px] font-semibold ${s.text}`}>{a.title}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{a.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
