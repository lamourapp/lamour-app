"use client";

import { useMemo, useState } from "react";
import {
  useOwnership,
  useSpecialists,
  useSettings,
  type OwnershipRevision,
} from "@/lib/hooks";
import { moneyFormatter, todayISO } from "@/lib/format";
import { Button, Input, inputCls, labelCls, selectCls } from "./ui";
import SingleDatePicker from "./SingleDatePicker";

/**
 * OwnershipScreen — розподіл прибутку між N власниками.
 *
 * Модель append-only: кожна зміна = нова ревізія (Дата + набір часток на
 * цю дату, сума 100%). Історія не переписується — старі записи журналу
 * продовжують ділитись за старою часткою.
 *
 * Flow:
 *  - Порожньо (ревізій немає): banner з поясненням + авто-seed одним
 *    кліком, якщо в системі зараз 1 власник — проставимо йому 100%.
 *  - Ревізії є: верхня карта з поточним розподілом (найсвіжіша ревізія),
 *    список історії нижче. Кнопка «Нова ревізія» відкриває guided-flow
 *    модалку, де вводять дату, ряди (хто + %), коментар.
 */
export default function OwnershipScreen({ onBack }: { onBack: () => void }) {
  const { revisions, loading, create, reload } = useOwnership();
  const { specialists, reload: reloadSpecialists } = useSpecialists(true);
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);

  const [showModal, setShowModal] = useState(false);
  const [prefill, setPrefill] = useState<OwnershipRevision | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const specialistNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of specialists) m.set(s.id, s.name);
    return m;
  }, [specialists]);

  const currentOwners = useMemo(
    () => specialists.filter((s) => s.isOwner),
    [specialists],
  );

  // Найсвіжіша ревізія (revisions відсортовані desc).
  const current = revisions[0] || null;

  async function handleCreate(payload: {
    date: string;
    shares: { specialistId: string; sharePct: number }[];
    comment?: string;
  }) {
    setSaving(true);
    setError("");
    try {
      await create({ ...payload, syncIsOwner: true });
      reloadSpecialists();
      setShowModal(false);
      setPrefill(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Seed для салону з 1 власником: створити ревізію з датою сьогодні
   * (або найранішого журнального запису, якщо відомо — наразі просто
   * today, бо не хочемо тягнути журнал на цей екран).
   */
  async function handleSeed() {
    if (currentOwners.length !== 1) return;
    await handleCreate({
      date: todayISO(),
      shares: [{ specialistId: currentOwners[0].id, sharePct: 100 }],
      comment: "Початковий стан",
    });
  }

  function openEdit(base: OwnershipRevision | null) {
    setPrefill(base);
    setShowModal(true);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Власники салону</h2>
      </div>

      <p className="text-[12px] text-gray-500 mb-4 leading-relaxed">
        Прибуток салону ділиться між власниками за налаштованими частками.
        Кожна зміна часток — це нова ревізія з датою; історичні записи
        залишаються поділеними за старими частками (нічого не переписуємо).
      </p>

      {loading ? (
        <div className="py-12 text-center text-[13px] text-gray-400">Завантаження…</div>
      ) : revisions.length === 0 ? (
        <EmptyState
          currentOwners={currentOwners}
          onSeed={handleSeed}
          onManual={() => openEdit(null)}
          saving={saving}
        />
      ) : (
        <>
          {current && (
            <CurrentRevisionCard revision={current} nameById={specialistNameById} />
          )}

          <div className="mt-4 flex justify-end">
            <Button onClick={() => openEdit(current)}>Нова ревізія</Button>
          </div>

          {/* Owner balances (інформативно) */}
          {currentOwners.length > 0 && (
            <div className="mt-5 bg-white border border-black/[0.06] rounded-xl p-4">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Поточні баланси власників
              </div>
              <div className="divide-y divide-black/5">
                {currentOwners.map((o) => (
                  <div key={o.id} className="flex items-center justify-between py-2">
                    <div className="text-[13px] text-gray-800">{o.name}</div>
                    <div className="flex gap-4 text-[13px] tabular-nums">
                      {o.ownerBalance !== undefined && (
                        <span className="text-brand-700 font-medium">{fmt(Math.round(o.ownerBalance))}</span>
                      )}
                      {o.balance !== o.ownerBalance && o.ownerBalance !== undefined && (
                        <span className="text-gray-500">майстер {fmt(Math.round(o.balance))}</span>
                      )}
                      {o.ownerBalance === undefined && (
                        <span className="text-brand-700 font-medium">{fmt(Math.round(o.balance))}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Історія ревізій */}
          {revisions.length > 1 && (
            <div className="mt-5">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                Історія змін
              </div>
              <div className="bg-white border border-black/[0.06] rounded-xl divide-y divide-black/5">
                {revisions.slice(1).map((r) => (
                  <RevisionRow key={r.date + r.recordIds.join(",")} revision={r} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 text-[13px] text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</div>
      )}

      {showModal && (
        <RevisionModal
          specialists={specialists}
          prefill={prefill}
          onClose={() => { setShowModal(false); setPrefill(null); setError(""); }}
          onSave={handleCreate}
          saving={saving}
        />
      )}
    </div>
  );
}

function EmptyState({
  currentOwners,
  onSeed,
  onManual,
  saving,
}: {
  currentOwners: { id: string; name: string }[];
  onSeed: () => void;
  onManual: () => void;
  saving: boolean;
}) {
  return (
    <div className="bg-white border border-black/[0.06] rounded-xl p-5">
      <div className="text-[14px] font-semibold text-gray-900 mb-1">Розподілу прибутку ще немає</div>
      <div className="text-[12px] text-gray-500 mb-4 leading-relaxed">
        Зафіксуймо поточний стан — це потрібно щоб коректно рахувати частки
        по історичних записах, коли в майбутньому додасте співвласників.
      </div>
      {currentOwners.length === 1 ? (
        <Button onClick={onSeed} disabled={saving}>
          Зафіксувати: {currentOwners[0].name} — 100%
        </Button>
      ) : currentOwners.length === 0 ? (
        <div className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Спочатку позначте хоча б одного співробітника як власника в розділі
          «Співробітники» (перемикач «Власник»).
        </div>
      ) : (
        <Button onClick={onManual} disabled={saving}>
          Ввести частки вручну
        </Button>
      )}
    </div>
  );
}

function CurrentRevisionCard({
  revision,
  nameById,
}: {
  revision: OwnershipRevision;
  nameById: Map<string, string>;
}) {
  // Кольори для стека — повторюємо brand з lightening для візуального різнобою.
  const palette = ["bg-brand-600", "bg-brand-400", "bg-brand-300", "bg-brand-200", "bg-brand-100"];
  return (
    <div className="bg-white border border-black/[0.06] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          Активний розподіл
        </div>
        <div className="text-[11px] text-gray-400">з {revision.date}</div>
      </div>

      {/* Stacked bar */}
      <div className="h-3 rounded-full overflow-hidden flex mb-3 bg-gray-100">
        {revision.shares.map((s, i) => (
          <div
            key={s.specialistId}
            className={palette[i % palette.length]}
            style={{ width: `${s.sharePct}%` }}
            title={`${nameById.get(s.specialistId) || s.specialistName || "?"} — ${s.sharePct}%`}
          />
        ))}
      </div>

      <div className="space-y-1.5">
        {revision.shares.map((s, i) => (
          <div key={s.specialistId} className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${palette[i % palette.length]}`} />
              <span className="text-gray-800 truncate">
                {nameById.get(s.specialistId) || s.specialistName || "?"}
              </span>
            </div>
            <span className="font-semibold text-gray-900 tabular-nums">{s.sharePct}%</span>
          </div>
        ))}
      </div>

      {revision.comment && (
        <div className="mt-3 pt-3 border-t border-black/5 text-[12px] text-gray-500">
          {revision.comment}
        </div>
      )}
    </div>
  );
}

function RevisionRow({ revision }: { revision: OwnershipRevision }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[12px] font-medium text-gray-700">з {revision.date}</div>
        <div className="text-[11px] text-gray-400">
          {revision.shares.length} {revision.shares.length === 1 ? "власник" : "власники"}
        </div>
      </div>
      <div className="text-[12px] text-gray-500">
        {revision.shares
          .map((s) => `${s.specialistName || "?"} ${s.sharePct}%`)
          .join(" · ")}
      </div>
      {revision.comment && (
        <div className="text-[11px] text-gray-400 mt-0.5">{revision.comment}</div>
      )}
    </div>
  );
}

/* ─── Модалка нової ревізії ─── */

interface ShareDraft {
  specialistId: string;
  sharePct: string; // string у state, щоб не мати проблем з порожнім полем
}

function RevisionModal({
  specialists,
  prefill,
  onClose,
  onSave,
  saving,
}: {
  specialists: { id: string; name: string; isOwner?: boolean }[];
  prefill: OwnershipRevision | null;
  onClose: () => void;
  onSave: (payload: {
    date: string;
    shares: { specialistId: string; sharePct: number }[];
    comment?: string;
  }) => Promise<void>;
  saving: boolean;
}) {
  const [date, setDate] = useState<string>(todayISO());
  const [rows, setRows] = useState<ShareDraft[]>(() => {
    if (prefill && prefill.shares.length > 0) {
      return prefill.shares.map((s) => ({
        specialistId: s.specialistId,
        sharePct: String(s.sharePct),
      }));
    }
    // За замовчуванням — один рядок з поточним власником на 100, якщо є.
    const firstOwner = specialists.find((s) => s.isOwner);
    return firstOwner
      ? [{ specialistId: firstOwner.id, sharePct: "100" }]
      : [{ specialistId: "", sharePct: "" }];
  });
  const [comment, setComment] = useState("");
  const [localError, setLocalError] = useState("");

  const pickable = useMemo(
    // Власники + активні спеціалісти (на випадок, якщо хтось додає
    // співвласника з уже існуючого майстра).
    () => specialists.filter((s) => s.isOwner || (s as { isActive?: boolean }).isActive !== false),
    [specialists],
  );

  const sum = useMemo(
    () => rows.reduce((acc, r) => acc + (parseFloat(r.sharePct) || 0), 0),
    [rows],
  );

  function updateRow(i: number, patch: Partial<ShareDraft>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((prev) => [...prev, { specialistId: "", sharePct: "" }]);
  }
  function distributeEvenly() {
    if (rows.length === 0) return;
    const each = Math.round((100 / rows.length) * 100) / 100;
    // Остання частка компенсує залишок.
    const fixed = rows.map((r, i) => ({
      ...r,
      sharePct:
        i === rows.length - 1
          ? String(Math.round((100 - each * (rows.length - 1)) * 100) / 100)
          : String(each),
    }));
    setRows(fixed);
  }

  async function handleSave() {
    setLocalError("");
    const shares = rows
      .map((r) => ({
        specialistId: r.specialistId,
        sharePct: parseFloat(r.sharePct) || 0,
      }))
      .filter((s) => s.specialistId && s.sharePct > 0);

    if (shares.length === 0) {
      setLocalError("Додайте хоча б одного власника");
      return;
    }
    const ids = new Set(shares.map((s) => s.specialistId));
    if (ids.size !== shares.length) {
      setLocalError("Один власник вказаний двічі");
      return;
    }
    if (Math.abs(sum - 100) > 0.01) {
      setLocalError(`Сума часток має бути 100%, зараз ${sum.toFixed(2)}`);
      return;
    }

    await onSave({ date, shares, comment: comment.trim() || undefined });
  }

  const sumOk = Math.abs(sum - 100) < 0.01;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[480px] sm:rounded-2xl rounded-t-2xl p-5 pb-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold text-gray-900">Нова ревізія розподілу</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label className={labelCls}>Дата початку дії</label>
          <SingleDatePicker value={date} onChange={setDate} />
          <div className="text-[11px] text-gray-400 mt-1">
            Нова частка діє з цієї дати й далі. Старі записи не змінюються.
          </div>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className={labelCls + " mb-0"}>Частки</span>
            <button
              type="button"
              onClick={distributeEvenly}
              className="text-[11px] text-brand-600 hover:text-brand-700 cursor-pointer font-medium"
            >
              Розділити порівну
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.specialistId}
                  onChange={(e) => updateRow(i, { specialistId: e.target.value })}
                  className={`${selectCls} flex-1`}
                >
                  <option value="">Оберіть спеціаліста</option>
                  {pickable.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <div className="relative w-[80px]">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={row.sharePct}
                    onChange={(e) => updateRow(i, { sharePct: e.target.value })}
                    placeholder="0"
                    className="tabular-nums pr-6"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[12px] pointer-events-none">%</span>
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="w-8 h-8 rounded-full bg-black/5 hover:bg-red-100 text-gray-400 hover:text-red-500 text-[12px] cursor-pointer transition-colors flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 w-full h-[40px] rounded-xl border border-dashed border-brand-300 text-[13px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors flex items-center justify-center gap-1"
          >
            <span className="text-[16px] leading-none">+</span> Додати власника
          </button>

          <div className={`mt-2 text-[12px] tabular-nums flex justify-between ${sumOk ? "text-green-600" : "text-red-500"}`}>
            <span>Сума</span>
            <span className="font-semibold">{sum.toFixed(2)}%</span>
          </div>
        </div>

        <div className="mb-5">
          <label className={labelCls}>Коментар</label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необов&apos;язково (причина зміни)"
            className={inputCls}
          />
        </div>

        {localError && (
          <div className="mb-3 text-[13px] text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{localError}</div>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !sumOk}
          className="w-full h-[48px]"
        >
          {saving ? "Збереження…" : "Зберегти ревізію"}
        </Button>
      </div>
    </div>
  );
}
