"use client";

import { useState, useMemo } from "react";
import type { Specialist, CompensationType } from "@/lib/types";
import { Button, Field, Input, Modal, Segmented, type SegmentedOption } from "./ui";
import { useSettings, useSpecializations, useCategories } from "@/lib/hooks";
import SingleDatePicker from "./SingleDatePicker";
import { currencySymbol } from "@/lib/format";
// Variant A (2026-04): % салону за послугу редагується для всіх типів оплати,
// тому `defaultSalonPctForService` вже не використовується тут — лишився в
// pricing.ts як довідник default-значень для нових записів.

interface SpecialistModalProps {
  specialist?: Specialist & { conditions?: number; birthdayRaw?: string };
  onClose: () => void;
  onSaved: () => void;
}

type EditableCompensationType = Exclude<CompensationType, "owner">;

const COMP_TYPES: SegmentedOption<EditableCompensationType>[] = [
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
  // Власник — ownership керується ВИКЛЮЧНО через /settings → Власники салону.
  // Тут немає isOwner тумблера, щоб не створювати другу точку правди. isOwner
  // прапорець на записі виставляється автоматично з ревізій розподілу прибутку
  // (див. POST /api/ownership → syncIsOwner).
  const isOwner = specialist?.isOwner === true;
  const [compensationType, setCompensationType] = useState<EditableCompensationType>(
    specialist?.compensationType && specialist.compensationType !== "owner"
      ? specialist.compensationType
      : "commission",
  );
  // serviceCommission (Variant A): для commission — це % салону за послугу
  // (default 30). Для salary/hourly/rental — теж % салону, але default 100
  // (салон забирає все, майстер не отримує комісії з послуги). Адмін може
  // знизити до, напр., 70 — тоді salary-майстер отримає 30% бонусу саме з
  // тих послуг, які виконав особисто. Див. `masterPayTotal` в pricing.ts.
  const [serviceCommission, setServiceCommission] = useState(
    specialist?.serviceCommission ??
      (specialist?.compensationType === "commission" || !specialist ? 30 : 100),
  );
  const [salesCommission, setSalesCommission] = useState(specialist?.salesCommission ?? 10);
  const [productSalesCommission, setProductSalesCommission] = useState(specialist?.productSalesCommission ?? 10);
  const [conditions, setConditions] = useState(specialist?.conditions ?? 0);
  // «Також виконує послуги як майстер» — тумблер для salary/hourly.
  // Увімкнений ⟺ людина отримує комісію з послуг/матеріалів/продажів ПОВЕРХ
  // основної оплати (salary/hourly через +ЗП). Під капотом ховає/показує ті
  // самі три поля (% салону, % матеріалів, % продажу), але робить очевидним,
  // що це «додаткова майстерська роль». Коли вимкнено — на save форсимо
  // salonPct=100 / mat=0 / sale=0 (майстерські частки обнулені).
  //
  // Ініціалізація з БД: якщо існуючий salary/hourly має ознаки майстерки
  // (salonPct<100 АБО matPct>0 АБО saleProductPct>0) — вмикаємо тумблер.
  // Для нових записів — вимкнено за замовчуванням.
  const existingMasterMode =
    !!specialist &&
    (specialist.compensationType === "salary" || specialist.compensationType === "hourly") &&
    ((specialist.serviceCommission ?? 100) < 100 ||
      (specialist.salesCommission ?? 0) > 0 ||
      (specialist.productSalesCommission ?? 0) > 0);
  const [masterMode, setMasterMode] = useState<boolean>(existingMasterMode);
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
      // Коли salary/hourly з вимкненим masterMode — форсимо «нульову
      // майстерську роль» (salon=100%, matPct=0, saleProductPct=0). Це
      // гарантує, що якщо адмін увімкнув masterMode, налаштував %, а потім
      // вимкнув — старі значення не залишаться в БД і не нарахують зайве.
      const isBaseRoleOnly =
        (compensationType === "salary" || compensationType === "hourly") && !masterMode;

      const payload: Record<string, unknown> = {
        name: name.trim(),
        specializationIds,
        birthday: birthday || undefined,
        compensationType,
        // `% cалону за послугу` — скільки салон забирає з (TSP−TMC) у формулі
        // коли FM=0. Variant A: редагується для всіх типів. Для salary/hourly
        // без masterMode — примусово 100, щоб послуга цього співробітника
        // (якщо випадково створять запис) не «вкрала» дохід салону.
        serviceCommission: isBaseRoleOnly ? 100 : serviceCommission,
        salesCommission: isBaseRoleOnly ? 0 : salesCommission,
        productSalesCommission: isBaseRoleOnly ? 0 : productSalesCommission,
        conditions: compensationType !== "commission" ? conditions : 0,
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
                  {creatingSpec ? "Створюю…" : "Додати"}
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

      {isOwner && (
        <div className="text-[11px] text-brand-700 bg-brand-50/60 border border-brand-100 rounded-lg px-3 py-2 leading-relaxed">
          Цей спеціаліст — <strong>співвласник</strong> салону (є в активному розподілі прибутку).
          Ставки нижче використовуються, якщо він також працює як майстер. Керування часткою —
          в <strong>Налаштування → Власники салону</strong>.
        </div>
      )}

      <div className="border-t border-black/5 pt-4">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Умови оплати</p>
      </div>

      <Field label="Тип оплати">
        <Segmented options={COMP_TYPES} value={compensationType} onChange={setCompensationType} />
      </Field>

      {compensationType === "commission" && (
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

      {compensationType === "rental" && (
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
          <Field
            label="% салону за послугу"
            hint="100 = салон забирає весь дохід з послуги (стандарт для орендаря). Знизь, якщо ділиш дохід з послуг окремо від оренди."
          >
            <Input
              type="number"
              value={serviceCommission}
              onChange={(e) => setServiceCommission(Number(e.target.value))}
              min={0}
              max={100}
            />
          </Field>
        </>
      )}

      {(compensationType === "hourly" || compensationType === "salary") && (
        <>
          <Field
            label={`Ставка, ${sym}/${compensationType === "hourly" ? "год" : "день"}`}
          >
            <Input
              type="number"
              value={conditions}
              onChange={(e) => setConditions(Number(e.target.value))}
              min={0}
            />
          </Field>
          <div
            className={`text-[11px] text-gray-500 leading-relaxed rounded-lg px-3 py-2 ${
              compensationType === "salary"
                ? "bg-amber-50/50 border border-amber-100"
                : "bg-brand-50/50 border border-brand-100"
            }`}
          >
            {compensationType === "salary" ? (
              <>
                💡 Ставка — сума, яку <strong>салон платить</strong> спеціалісту. Нараховується
                через кнопку <strong>«+ ЗП»</strong> на картці в команді. До балансу додається як
                «борг»; виплата закривається звичайним «Розрахунком».
              </>
            ) : (
              <>
                💡 Оплата майстру = <strong>ставка × години</strong> в кожному записі послуги.
                Ставка підставляється автоматично з картки при внесенні послуги.
              </>
            )}
          </div>

          {/* Опційний блок «майстерської ролі» для адмінів/погодинних, які
              крім основної оплати ще й виконують послуги як майстри. Це
              Variant A: salonPct<100 → масtery-бонус; matPct/saleProductPct
              → стандартні комісійні частки. Якщо тумблер вимкнено — на save
              форсимо 100/0/0, щоб старі значення не лишались активними. */}
          <div className="border border-black/10 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setMasterMode((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-3 bg-gray-50/60 hover:bg-gray-100/60 cursor-pointer transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-gray-900">
                  Також виконує послуги як майстер
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                  Додає комісію з послуг/матеріалів/продажів <strong>поверх</strong>{" "}
                  {compensationType === "salary" ? "ЗП" : "погодинної оплати"}. Приклад: адмін, який
                  інколи робить лаш/манікюр.
                </div>
              </div>
              <div
                className={`shrink-0 w-10 h-6 rounded-full relative transition-colors ${
                  masterMode ? "bg-brand-600" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={masterMode}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                    masterMode ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </div>
            </button>

            {masterMode && (
              <div className="px-3.5 py-3 space-y-3 border-t border-black/5 bg-white">
                <Field
                  label="% салону за послугу"
                  hint="Напр. 70 → майстру лишається 30% з (вартість послуги − матеріали)."
                >
                  <Input
                    type="number"
                    value={serviceCommission}
                    onChange={(e) => setServiceCommission(Number(e.target.value))}
                    min={0}
                    max={100}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="% майстру з матеріалів">
                    <Input
                      type="number"
                      value={salesCommission}
                      onChange={(e) => setSalesCommission(Number(e.target.value))}
                      min={0}
                      max={100}
                    />
                  </Field>
                  <Field label="% майстру за продаж товарів">
                    <Input
                      type="number"
                      value={productSalesCommission}
                      onChange={(e) => setProductSalesCommission(Number(e.target.value))}
                      min={0}
                      max={100}
                    />
                  </Field>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} fullWidth size="lg">
        {saving ? "Зберігаю…" : isEdit ? "Зберегти зміни" : "Додати спеціаліста"}
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
