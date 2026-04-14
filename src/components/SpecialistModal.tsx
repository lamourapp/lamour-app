"use client";

import { useState } from "react";
import type { Specialist, CompensationType } from "@/lib/demo-data";

interface SpecialistModalProps {
  specialist?: Specialist & { conditions?: number; birthdayRaw?: string };
  onClose: () => void;
  onSaved: () => void;
}

const inputCls = "w-full h-[44px] rounded-xl border border-black/[0.08] px-3 text-[16px] text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors";
const selectCls = "appearance-none w-full h-[44px] rounded-xl border border-black/[0.08] pl-3 pr-8 text-[16px] text-gray-800 bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-colors";
const labelCls = "block text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-1";

const ROLES = [
  "Перукарі",
  "Візажисти, бровісти",
  "Нігтьовий сервіс",
  "Адміністратори",
];

const COMP_TYPES: { id: CompensationType; label: string }[] = [
  { id: "commission", label: "Комісія (%)" },
  { id: "rental", label: "Оренда" },
  { id: "salary", label: "Зарплата (ставка)" },
];

export default function SpecialistModal({ specialist, onClose, onSaved }: SpecialistModalProps) {
  const isEdit = !!specialist;

  const [name, setName] = useState(specialist?.name || "");
  const [role, setRole] = useState(specialist?.role || ROLES[0]);
  const [compensationType, setCompensationType] = useState<CompensationType>(specialist?.compensationType || "commission");
  const [serviceCommission, setServiceCommission] = useState(specialist?.serviceCommission ?? 30);
  const [salesCommission, setSalesCommission] = useState(specialist?.salesCommission ?? 10);
  const [conditions, setConditions] = useState(specialist?.conditions ?? 0);
  const [birthday, setBirthday] = useState(specialist?.birthdayRaw || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  async function handleSave() {
    if (!name.trim()) {
      setError("Вкажіть ім'я");
      return;
    }
    setSaving(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        role,
        compensationType,
        serviceCommission: compensationType === "commission" ? serviceCommission : 0,
        salesCommission,
        conditions: compensationType !== "commission" ? conditions : 0,
        birthday: birthday || undefined,
      };

      if (isEdit) {
        const res = await fetch("/api/specialists", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: specialist.id, ...payload }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
      } else {
        const res = await fetch("/api/specialists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    setSaving(true);
    try {
      const res = await fetch("/api/specialists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: specialist!.id, isActive: false }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setConfirmDeactivate(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  async function handleReactivate() {
    setSaving(true);
    try {
      const res = await fetch("/api/specialists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: specialist!.id, isActive: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  const chevronSvg = (
    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
    </svg>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-black/5 px-5 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-[16px] font-semibold text-gray-900">
            {isEdit ? "Редагувати спеціаліста" : "Новий спеціаліст"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Ім&apos;я</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ім'я спеціаліста"
              className={inputCls}
            />
          </div>

          {/* Role */}
          <div>
            <label className={labelCls}>Спеціалізація</label>
            <div className="relative">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              {chevronSvg}
            </div>
          </div>

          {/* Birthday */}
          <div>
            <label className={labelCls}>Дата народження</label>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Divider */}
          <div className="border-t border-black/5 pt-4">
            <p className="text-[12px] font-medium text-gray-500 uppercase tracking-wider mb-3">Умови оплати</p>
          </div>

          {/* Compensation type */}
          <div>
            <label className={labelCls}>Тип оплати</label>
            <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5">
              {COMP_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setCompensationType(ct.id)}
                  className={`flex-1 px-2 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all
                    ${compensationType === ct.id ? "bg-brand-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {/* Commission fields */}
          {compensationType === "commission" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>% салону за послугу</label>
                <input
                  type="number"
                  value={serviceCommission}
                  onChange={(e) => setServiceCommission(Number(e.target.value))}
                  className={inputCls}
                  min={0}
                  max={100}
                />
              </div>
              <div>
                <label className={labelCls}>% майстру з матеріалів</label>
                <input
                  type="number"
                  value={salesCommission}
                  onChange={(e) => setSalesCommission(Number(e.target.value))}
                  className={inputCls}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          )}

          {/* Rental fields */}
          {compensationType === "rental" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Ставка оренди, ₴</label>
                <input
                  type="number"
                  value={conditions}
                  onChange={(e) => setConditions(Number(e.target.value))}
                  className={inputCls}
                  min={0}
                />
              </div>
              <div>
                <label className={labelCls}>% майстру з матеріалів</label>
                <input
                  type="number"
                  value={salesCommission}
                  onChange={(e) => setSalesCommission(Number(e.target.value))}
                  className={inputCls}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          )}

          {/* Salary fields */}
          {compensationType === "salary" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Ставка, ₴/день</label>
                  <input
                    type="number"
                    value={conditions}
                    onChange={(e) => setConditions(Number(e.target.value))}
                    className={inputCls}
                    min={0}
                  />
                </div>
                <div>
                  <label className={labelCls}>% майстру з матеріалів</label>
                  <input
                    type="number"
                    value={salesCommission}
                    onChange={(e) => setSalesCommission(Number(e.target.value))}
                    className={inputCls}
                    min={0}
                    max={100}
                  />
                </div>
              </div>
              <div className="text-[11px] text-gray-400 leading-relaxed bg-amber-50/50 border border-amber-100 rounded-lg px-3 py-2">
                💡 Ставка — це сума, яку <strong>салон платить</strong> спеціалісту.
                Виплати ЗП записуються в журнал як <strong>витрата</strong> з видом &quot;Зарплата&quot;.
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2">{error}</div>
          )}

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-[48px] bg-brand-600 text-white rounded-xl font-semibold text-[15px] cursor-pointer hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Зберігаю..." : isEdit ? "Зберегти зміни" : "Додати спеціаліста"}
          </button>

          {/* Deactivate / Reactivate */}
          {isEdit && (
            <div className="pt-2 border-t border-black/5">
              {specialist.isActive !== false ? (
                !confirmDeactivate ? (
                  <button
                    onClick={() => setConfirmDeactivate(true)}
                    className="w-full py-2.5 text-[13px] text-red-500 hover:text-red-600 hover:bg-red-50 rounded-xl cursor-pointer transition-colors"
                  >
                    Деактивувати спеціаліста
                  </button>
                ) : (
                  <div className="flex items-center justify-center gap-3 py-2">
                    <span className="text-[13px] text-gray-600">Деактивувати?</span>
                    <button
                      onClick={handleDeactivate}
                      disabled={saving}
                      className="px-4 py-1.5 rounded-lg bg-red-500 text-white text-[12px] font-medium cursor-pointer hover:bg-red-600 transition-colors"
                    >
                      Так
                    </button>
                    <button
                      onClick={() => setConfirmDeactivate(false)}
                      className="px-4 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[12px] font-medium cursor-pointer hover:bg-gray-200 transition-colors"
                    >
                      Ні
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={handleReactivate}
                  disabled={saving}
                  className="w-full py-2.5 text-[13px] text-green-600 hover:text-green-700 hover:bg-green-50 rounded-xl cursor-pointer transition-colors"
                >
                  Активувати спеціаліста
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom safe area */}
        <div className="h-6" />
      </div>
    </div>
  );
}
