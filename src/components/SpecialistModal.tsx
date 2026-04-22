"use client";

import { useState, useMemo } from "react";
import type { Specialist, CompensationType } from "@/lib/types";
import { Button, Field, Input, Modal, Segmented, type SegmentedOption } from "./ui";
import { useSettings, useSpecializations, useCategories } from "@/lib/hooks";
import SingleDatePicker from "./SingleDatePicker";
import { currencySymbol } from "@/lib/format";

interface SpecialistModalProps {
  specialist?: Specialist & { conditions?: number; birthdayRaw?: string };
  onClose: () => void;
  onSaved: () => void;
}

const COMP_TYPES: SegmentedOption<CompensationType>[] = [
  { id: "commission", label: "Комісія (%)" },
  { id: "rental", label: "Оренда" },
  { id: "hourly", label: "Погодинна" },
  { id: "salary", label: "Зарплата" },
];

export default function SpecialistModal({ specialist, onClose, onSaved }: SpecialistModalProps) {
  const isEdit = !!specialist;
  const { settings } = useSettings();
  const sym = currencySymbol(settings?.currency);
  // include archived so existing specialists with archived link keep the chip.
  const { specializations: allSpecs, create: createSpecialization } = useSpecializations(true);
  // Only active ones are offered for new selection.
  const activeSpecs = useMemo(() => allSpecs.filter((s) => s.isActive), [allSpecs]);
  // Render currently-selected IDs even if archived, so data isn't silently lost.
  const visibleSpecs = useMemo(() => {
    const linkedArchived = allSpecs.filter(
      (s) => !s.isActive && (specialist?.specializationIds || []).includes(s.id),
    );
    return [...activeSpecs, ...linkedArchived];
  }, [allSpecs, activeSpecs, specialist?.specializationIds]);
  const specializations = allSpecs; // backwards-compat alias for other refs below
  const { categories: allCategories } = useCategories(false); // only active
  const categoryOptions = useMemo(() => allCategories, [allCategories]);

  const [name, setName] = useState(specialist?.name || "");
  const [specializationIds, setSpecializationIds] = useState<string[]>(
    specialist?.specializationIds || [],
  );
  // Власник — особливий «спеціаліст»: без ставок, з віртуальним балансом,
  // окрема секція у StaffScreen. Тумблер працює навіть при редагуванні:
  // можна зняти з існуючого (втратить особливий рендер і попросить тип оплати)
  // або додати. API сам не дасть двох власників.
  const [isOwner, setIsOwner] = useState<boolean>(specialist?.isOwner === true);
  const [compensationType, setCompensationType] = useState<CompensationType>(
    specialist?.compensationType && specialist.compensationType !== "owner"
      ? specialist.compensationType
      : "commission",
  );
  const [serviceCommission, setServiceCommission] = useState(specialist?.serviceCommission ?? 30);
  const [salesCommission, setSalesCommission] = useState(specialist?.salesCommission ?? 10);
  const [productSalesCommission, setProductSalesCommission] = useState(specialist?.productSalesCommission ?? 10);
  const [conditions, setConditions] = useState(specialist?.conditions ?? 0);
  const [birthday, setBirthday] = useState(specialist?.birthdayRaw || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Inline "create new specialization" form
  const [showNewSpec, setShowNewSpec] = useState(false);
  const [newSpecName, setNewSpecName] = useState("");
  const [newSpecCategoryIds, setNewSpecCategoryIds] = useState<string[]>([]);
  const [creatingSpec, setCreatingSpec] = useState(false);

  function toggleSpec(id: string) {
    setSpecializationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleNewSpecCategory(id: string) {
    setNewSpecCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCreateSpec() {
    if (!newSpecName.trim()) return;
    setCreatingSpec(true);
    try {
      const created = await createSpecialization({
        name: newSpecName.trim(),
        categoryIds: newSpecCategoryIds,
        sortOrder: (specializations[specializations.length - 1]?.sortOrder ?? 0) + 1,
      });
      setSpecializationIds((prev) => [...prev, created.id]);
      setNewSpecName("");
      setNewSpecCategoryIds([]);
      setShowNewSpec(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося створити спеціалізацію");
    } finally {
      setCreatingSpec(false);
    }
  }

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
        specializationIds,
        birthday: birthday || undefined,
        isOwner,
      };

      if (!isOwner) {
        payload.compensationType = compensationType;
        // For rental masters we force 100% salon cut so the rental line
        // ("Оренда робочого місця" as a service) counts fully as salon income.
        // Commission masters use their configured %. Salary masters = 0.
        payload.serviceCommission =
          compensationType === "commission" ? serviceCommission :
          compensationType === "rental" ? 100 :
          0; // hourly & salary: master pay determined by snapshot/fixed rate
        payload.salesCommission = salesCommission;
        payload.productSalesCommission = productSalesCommission;
        payload.conditions = compensationType !== "commission" ? conditions : 0;
      }

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

      <Field label="Спеціалізації">
        <div className="space-y-1.5">
          {specializations.length === 0 ? (
            <div className="text-[13px] text-gray-400 italic px-1">
              Ще немає спеціалізацій. Додайте першу нижче.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {visibleSpecs.map((s) => {
                const on = specializationIds.includes(s.id);
                const archived = !s.isActive;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSpec(s.id)}
                    title={archived ? "Архівна — залишена на майстрі для історії" : undefined}
                    className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors cursor-pointer border ${
                      on
                        ? archived
                          ? "bg-gray-400 text-white border-gray-400"
                          : "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-gray-700 border-black/10 hover:border-brand-500"
                    }`}
                  >
                    {s.name}{archived && " (архів)"}
                  </button>
                );
              })}
            </div>
          )}

          {!showNewSpec ? (
            <button
              type="button"
              onClick={() => setShowNewSpec(true)}
              className="text-[12px] text-brand-600 hover:text-brand-700 cursor-pointer pt-1"
            >
              + Нова спеціалізація
            </button>
          ) : (
            <div className="border border-black/10 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
              <Input
                type="text"
                value={newSpecName}
                onChange={(e) => setNewSpecName(e.target.value)}
                placeholder="Назва (напр. Бровіст)"
                autoFocus
              />
              {categoryOptions.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Які послуги може виконувати
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {categoryOptions.map((cat) => {
                      const on = newSpecCategoryIds.includes(cat.id);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => toggleNewSpecCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-full text-[12px] transition-colors cursor-pointer border ${
                            on
                              ? "bg-brand-600 text-white border-brand-600"
                              : "bg-white text-gray-600 border-black/10 hover:border-brand-500"
                          }`}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleCreateSpec}
                  disabled={creatingSpec || !newSpecName.trim()}
                >
                  {creatingSpec ? "Створюю..." : "Додати"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowNewSpec(false);
                    setNewSpecName("");
                    setNewSpecCategoryIds([]);
                  }}
                >
                  Скасувати
                </Button>
              </div>
            </div>
          )}
        </div>
      </Field>

      <Field label="Дата народження">
        <SingleDatePicker value={birthday} onChange={setBirthday} />
      </Field>

      {/* Власник салону — окремий флаг. Коли увімкнено, приховуємо блок
          «Умови оплати» повністю: у власника немає ставок, а прибуток
          формується автоматично як virtual balance. */}
      <label className="flex items-center gap-3 px-3 py-2.5 bg-brand-50/50 rounded-xl cursor-pointer select-none border border-brand-100">
        <div className="relative">
          <input
            type="checkbox"
            checked={isOwner}
            onChange={(e) => setIsOwner(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-brand-500 transition-colors" />
          <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] text-gray-900 font-medium">Власник салону</div>
          <div className="text-[11px] text-gray-400 leading-snug">
            {isOwner
              ? "Баланс = накопичений прибуток мінус вилучення. Без ставок і % — це не майстер."
              : "Позначити цього спеціаліста як власника (один на салон)."}
          </div>
        </div>
      </label>

      {!isOwner && (
        <>
          <div className="border-t border-black/5 pt-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Умови оплати</p>
          </div>

          <Field label="Тип оплати">
            <Segmented options={COMP_TYPES} value={compensationType} onChange={setCompensationType} />
          </Field>
        </>
      )}

      {!isOwner && compensationType === "commission" && (
        <>
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
          <Field label="% майстру за продаж товарів">
            <Input
              type="number"
              value={productSalesCommission}
              onChange={(e) => setProductSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
        </>
      )}

      {!isOwner && compensationType === "rental" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Ставка оренди, ${sym}`}>
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
          <Field label="% майстру за продаж товарів">
            <Input
              type="number"
              value={productSalesCommission}
              onChange={(e) => setProductSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
        </>
      )}

      {!isOwner && compensationType === "hourly" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Ставка, ${sym}/год`}>
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
          <Field label="% майстру за продаж товарів">
            <Input
              type="number"
              value={productSalesCommission}
              onChange={(e) => setProductSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
          <div className="text-[11px] text-gray-500 leading-relaxed bg-brand-50/50 border border-brand-100 rounded-lg px-3 py-2">
            💡 Оплата майстру = <strong>ставка × кількість годин</strong> в кожному записі послуги.
            Ставка зберігається в картці та підставляється при внесенні послуги.
          </div>
        </>
      )}

      {!isOwner && compensationType === "salary" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Ставка, ${sym}/день`}>
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
          <Field label="% майстру за продаж товарів">
            <Input
              type="number"
              value={productSalesCommission}
              onChange={(e) => setProductSalesCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
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
