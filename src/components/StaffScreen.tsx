"use client";

import { useMemo, useState } from "react";
import { useSpecialists, useSettings, useSpecializations } from "@/lib/hooks";
import type { Specialist } from "@/lib/demo-data";
import { moneyFormatter, currencySymbol } from "@/lib/format";

type Fmt = (amount: number, opts?: { signed?: boolean; maximumFractionDigits?: number }) => string;
import SpecialistModal from "./SpecialistModal";

function compensationLabel(s: Specialist, fmt: Fmt, sym: string): string {
  const materialsLabel = s.salesCommission > 0 ? ` · матер. ${s.salesCommission}%` : "";
  const salesLabel = s.productSalesCommission > 0 ? ` · продаж ${s.productSalesCommission}%` : "";
  switch (s.compensationType) {
    case "commission":
      return `комісія ${s.serviceCommission}%${materialsLabel}${salesLabel}`;
    case "rental":
      return `оренда${s.rentalRate ? ` ${fmt(s.rentalRate)}` : ""}${materialsLabel}${salesLabel}`;
    case "hourly":
      return `погодинна ${s.hourlyRate ? `${fmt(s.hourlyRate)} ${sym}/год` : ""}${materialsLabel}${salesLabel}`;
    case "salary":
      return `ЗП ${s.salaryRate} ${sym}/день${materialsLabel}${salesLabel}`;
    default:
      return "";
  }
}

function avatarBg(color: Specialist["avatarColor"]): string {
  switch (color) {
    case "brand": return "bg-brand-50";
    case "amber": return "bg-amber-50";
    case "gray": return "bg-gray-100";
  }
}

function avatarText(color: Specialist["avatarColor"]): string {
  switch (color) {
    case "brand": return "text-brand-600";
    case "amber": return "text-amber-600";
    case "gray": return "text-gray-500";
  }
}

function compensationHighlight(type: Specialist["compensationType"]): string {
  switch (type) {
    case "rental": return "text-amber-600";
    case "salary": return "text-gray-500";
    default: return "";
  }
}

function BalanceDisplay({ balance, fmt }: { balance: number; fmt: Fmt }) {
  if (balance === 0) {
    return <div className="text-[13px] font-semibold text-gray-400 tabular-nums">{fmt(0)}</div>;
  }
  if (balance > 0) {
    return <div className="text-[13px] font-semibold text-gray-900 tabular-nums">{fmt(balance, { signed: true })}</div>;
  }
  return <div className="text-[13px] font-semibold text-red-500 tabular-nums">{fmt(balance)}</div>;
}

export default function StaffScreen() {
  const [showInactive, setShowInactive] = useState(false);
  const { settings } = useSettings();
  const fmt = useMemo(() => moneyFormatter(settings), [settings]);
  const sym = currencySymbol(settings?.currency);
  const specialistTerm = settings?.specialistTerm || "Спеціаліст";
  const { specialists, loading, error, reload } = useSpecialists(showInactive);
  // include archived so names of archived linked specializations still render in labels
  const { specializations } = useSpecializations(true);

  // Resolve display label for a specialist's role(s) — joins names of linked
  // Спеціалізації.
  function roleLabel(s: Specialist): string {
    const ids = s.specializationIds || [];
    if (ids.length === 0) return "";
    const names = ids
      .map((id) => specializations.find((x) => x.id === id)?.name)
      .filter(Boolean) as string[];
    return names.join(" · ");
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<Specialist | null>(null);

  const activeList = specialists.filter((s) => s.isActive !== false);
  const inactiveList = specialists.filter((s) => s.isActive === false);

  function openCreate() {
    setEditingSpecialist(null);
    setModalOpen(true);
  }

  function openEdit(s: Specialist) {
    setEditingSpecialist(s);
    setModalOpen(true);
  }

  function handleSaved() {
    reload();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">{specialistTerm}и</h2>
        <button
          onClick={openCreate}
          className="bg-brand-600 text-white rounded-[10px] font-medium text-[13px] px-4 py-2 cursor-pointer hover:bg-brand-700 transition-colors"
        >
          + Додати
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Завантаження...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-[13px]">Помилка: {error}</div>
      )}

      {/* Active specialists */}
      <div className="space-y-1.5">
        {activeList.map((s) => {
          const label = compensationLabel(s, fmt, sym);
          const highlight = compensationHighlight(s.compensationType);

          return (
            <div
              key={s.id}
              onClick={() => openEdit(s)}
              className="bg-white rounded-xl border border-black/[0.06] px-4 py-3.5 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 ${avatarBg(s.avatarColor)} rounded-full flex items-center justify-center shrink-0`}>
                    <span className={`${avatarText(s.avatarColor)} font-semibold text-[13px]`}>
                      {s.name[0]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {roleLabel(s)} ·{" "}
                      {highlight ? (
                        <span className={highlight}>{label}</span>
                      ) : (
                        label
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">Д.Н.</div>
                    <div className="text-[12px] text-gray-500">{s.birthday || "—"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">Баланс</div>
                    <BalanceDisplay balance={s.balance} fmt={fmt} />
                  </div>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show inactive toggle */}
      {!loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          >
            {showInactive ? "Сховати неактивних" : "Показати неактивних"}
          </button>
        </div>
      )}

      {/* Inactive specialists */}
      {showInactive && inactiveList.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-2 px-1">Неактивні</div>
          <div className="space-y-1.5">
            {inactiveList.map((s) => {
              const label = compensationLabel(s, fmt, sym);

              return (
                <div
                  key={s.id}
                  onClick={() => openEdit(s)}
                  className="bg-gray-50 rounded-xl border border-black/[0.04] px-4 py-3.5 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] opacity-60 hover:opacity-80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-gray-400 font-semibold text-[13px]">
                          {s.name[0]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-gray-500 truncate">{s.name}</div>
                        <div className="text-[11px] text-gray-400 truncate">{roleLabel(s)} · {label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Баланс</div>
                        <BalanceDisplay balance={s.balance} fmt={fmt} />
                      </div>
                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <SpecialistModal
          specialist={editingSpecialist || undefined}
          onClose={() => { setModalOpen(false); setEditingSpecialist(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
