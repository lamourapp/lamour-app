"use client";

import { useState } from "react";
import type { Specialist, CompensationType } from "@/lib/demo-data";
import { Button, Field, Input, Modal, Segmented, Select, type SegmentedOption } from "./ui";

interface SpecialistModalProps {
  specialist?: Specialist & { conditions?: number; birthdayRaw?: string };
  onClose: () => void;
  onSaved: () => void;
}

const ROLES = [
  "Перукарі",
  "Візажисти, бровісти",
  "Нігтьовий сервіс",
  "Адміністратори",
];

const COMP_TYPES: SegmentedOption<CompensationType>[] = [
  { id: "commission", label: "Комісія (%)" },
  { id: "rental", label: "Оренда" },
  { id: "salary", label: "Зарплата" },
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

      const url = "/api/specialists";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: specialist!.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  async function patchActive(isActive: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/specialists", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: specialist!.id, isActive }),
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

  return (
    <Modal title={isEdit ? "Редагувати спеціаліста" : "Новий спеціаліст"} onClose={onClose}>
      <Field label="Ім'я">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ім'я спеціаліста"
        />
      </Field>

      <Field label="Спеціалізація">
        <Select value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
      </Field>

      <Field label="Дата народження">
        <Input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
      </Field>

      <div className="border-t border-black/5 pt-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Умови оплати</p>
      </div>

      <Field label="Тип оплати">
        <Segmented options={COMP_TYPES} value={compensationType} onChange={setCompensationType} />
      </Field>

      {compensationType === "commission" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="% салону за послугу">
            <Input
              type="number"
              value={serviceCommission}
              onChange={(e) => setServiceCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
          <Field label="% майстру з матеріалів">
            <Input
              type="number"
              value={salesCommission}
              onChange={(e) => setSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
        </div>
      )}

      {compensationType === "rental" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ставка оренди, ₴">
            <Input
              type="number"
              value={conditions}
              onChange={(e) => setConditions(Number(e.target.value))}
              min={0}
            />
          </Field>
          <Field label="% майстру з матеріалів">
            <Input
              type="number"
              value={salesCommission}
              onChange={(e) => setSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
        </div>
      )}

      {compensationType === "salary" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ставка, ₴/день">
              <Input
                type="number"
                value={conditions}
                onChange={(e) => setConditions(Number(e.target.value))}
                min={0}
              />
            </Field>
            <Field label="% майстру з матеріалів">
              <Input
                type="number"
                value={salesCommission}
                onChange={(e) => setSalesCommission(Number(e.target.value))}
                min={0}
                max={100}
              />
            </Field>
          </div>
          <div className="text-[11px] text-gray-500 leading-relaxed bg-amber-50/50 border border-amber-100 rounded-lg px-3 py-2">
            💡 Ставка — це сума, яку <strong>салон платить</strong> спеціалісту.
            Виплати ЗП записуються в журнал як <strong>витрата</strong> з видом &quot;Зарплата&quot;.
          </div>
        </>
      )}

      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} fullWidth size="lg">
        {saving ? "Зберігаю..." : isEdit ? "Зберегти зміни" : "Додати спеціаліста"}
      </Button>

      {isEdit && (
        <div className="pt-2 border-t border-black/5">
          {specialist!.isActive !== false ? (
            !confirmDeactivate ? (
              <Button
                variant="danger-ghost"
                fullWidth
                onClick={() => setConfirmDeactivate(true)}
              >
                Деактивувати спеціаліста
              </Button>
            ) : (
              <div className="flex items-center justify-center gap-3 py-2">
                <span className="text-[13px] text-gray-600">Деактивувати?</span>
                <Button variant="danger" size="sm" onClick={() => patchActive(false)} disabled={saving}>
                  Так
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmDeactivate(false)}>
                  Ні
                </Button>
              </div>
            )
          ) : (
            <Button
              fullWidth
              onClick={() => patchActive(true)}
              disabled={saving}
              className="bg-green-50 text-green-700 hover:bg-green-100"
              variant="ghost"
            >
              Активувати спеціаліста
            </Button>
          )}
        </div>
      )}
    </Modal>
  );
}
