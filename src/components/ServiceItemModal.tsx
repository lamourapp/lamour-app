"use client";

import { useState, useMemo, useEffect } from "react";
import { Button, Field, Input, Modal, Select } from "./ui";
import SearchableSelect from "./SearchableSelect";
import type { ServiceCatalogItem } from "@/lib/hooks";
import { useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";

interface Props {
  item?: ServiceCatalogItem | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Матеріал з каталогу (мінімум для калькулятора). Форма читає materials
 * напряму з /api/materials — не через useMaterials, бо хук робить
 * зайві перерендери при наборі qty.
 */
interface CatalogMaterial {
  id: string;
  name: string;
  totalVolume: number;
  salePrice: number;
  costPrice: number;
  unit?: string;
}

interface CalcRow {
  materialId: string;
  qty: number;
}

export default function ServiceItemModal({ item, categories, onClose, onSaved }: Props) {
  const isEdit = !!item;
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);

  const [name, setName] = useState(item?.name || "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);

  // Determine initial pricing mode from existing data
  const initialHourly = !!(item?.hours && item.hours > 0);
  const [pricingMode, setPricingMode] = useState<"fixed" | "hourly">(initialHourly ? "hourly" : "fixed");

  const [workPrice, setWorkPrice] = useState(
    initialHourly ? "" : (item?.workPrice?.toString() || "")
  );
  const [hourlyRate, setHourlyRate] = useState(
    initialHourly ? (item?.hourlyRate?.toString() || item?.workPrice?.toString() || "") : ""
  );
  const [hours, setHours] = useState(item?.hours?.toString() || "");
  const [materialsCost, setMaterialsCost] = useState(item?.materialsCost?.toString() || "");
  const [duration, setDuration] = useState(item?.duration?.toString() || "");
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  // Калькулятор (2026-04)
  const [hasCalculator, setHasCalculator] = useState<boolean>(item?.hasCalculator ?? false);
  const [calcRows, setCalcRows] = useState<CalcRow[]>(
    () =>
      (item?.calculatorItems || []).map((ci) => ({
        materialId: ci.materialId,
        qty: ci.qty,
      })),
  );
  const [materials, setMaterials] = useState<CatalogMaterial[]>([]);
  const [materialsLoaded, setMaterialsLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Матеріали тягнемо тільки коли вперше відкривається калькулятор
  // (щоб не лайтонити модалку без потреби).
  useEffect(() => {
    if (!hasCalculator || materialsLoaded) return;
    fetch("/api/materials", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CatalogMaterial[]) => { setMaterials(d); setMaterialsLoaded(true); })
      .catch(() => setMaterialsLoaded(true));
  }, [hasCalculator, materialsLoaded]);

  // Map для швидкого lookup цін у редакторі рядків.
  const materialById = useMemo(() => {
    const m = new Map<string, CatalogMaterial>();
    materials.forEach((mat) => m.set(mat.id, mat));
    return m;
  }, [materials]);

  // Live materials cost (sale + purchase) за поточним прайсом.
  const calcTotals = useMemo(() => {
    let sale = 0;
    let purchase = 0;
    for (const row of calcRows) {
      const mat = materialById.get(row.materialId);
      if (!mat || row.qty <= 0 || mat.totalVolume <= 0) continue;
      sale += (row.qty * mat.salePrice) / mat.totalVolume;
      purchase += (row.qty * mat.costPrice) / mat.totalVolume;
    }
    return { sale, purchase };
  }, [calcRows, materialById]);

  // При ввімкненому калькуляторі materialsCost readonly — показуємо live.
  const effectiveMaterials = hasCalculator ? Math.round(calcTotals.sale) : parseFloat(materialsCost) || 0;

  // Price preview
  const preview = useMemo(() => {
    const mat = effectiveMaterials;

    if (pricingMode === "hourly") {
      const rate = parseFloat(hourlyRate) || 0;
      const h = parseFloat(hours) || 0;
      const work = rate * h;
      return { work, materials: mat, total: work + mat, isHourly: true, rate, hours: h };
    } else {
      const wp = parseFloat(workPrice) || 0;
      return { work: wp, materials: mat, total: wp + mat, isHourly: false, rate: 0, hours: 0 };
    }
  }, [pricingMode, workPrice, hourlyRate, hours, effectiveMaterials]);

  function updateRow(idx: number, patch: Partial<CalcRow>) {
    setCalcRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRow(idx: number) {
    setCalcRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function addRow() {
    setCalcRows((prev) => [...prev, { materialId: "", qty: 0 }]);
  }

  async function handleSave() {
    if (!name.trim()) { setError("Вкажіть назву"); return; }

    setSaving(true);
    setError("");

    try {
      // If user typed a new category name, create it first and use the fresh id.
      let effectiveCategoryId = categoryId;
      if (showNewCategory && newCategoryName.trim()) {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCategoryName.trim() }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Не вдалося створити категорію");
        const { id } = (await res.json()) as { id: string };
        effectiveCategoryId = id;
      }

      const payload: Record<string, unknown> = {
        name: name.trim(),
        isActive,
      };

      // Always write the full pricing triple so toggling fixed↔hourly
      // doesn't leave stale values from the other mode lingering in Airtable.
      if (pricingMode === "hourly") {
        const rate = parseFloat(hourlyRate) || 0;
        const h = parseFloat(hours) || 0;
        payload.workPrice = rate;
        payload.hourlyRate = rate;
        payload.hours = h;
      } else {
        const wp = parseFloat(workPrice) || 0;
        payload.workPrice = wp;
        payload.hourlyRate = 0;
        payload.hours = 0;
      }

      // Калькулятор: передаємо hasCalculator завжди (true/false) — API сам
      // вирішить, писати snapshot-и чи ручні значення.
      payload.hasCalculator = hasCalculator;
      if (hasCalculator) {
        payload.calculatorItems = calcRows
          .filter((r) => r.materialId && r.qty > 0)
          .map((r) => ({ materialId: r.materialId, qty: r.qty }));
      } else {
        if (materialsCost) payload.materialsCost = parseFloat(materialsCost);
      }

      if (duration) payload.duration = parseInt(duration);
      payload.categoryId = effectiveCategoryId || "";

      const res = await fetch("/api/services-catalog", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: item!.id, ...payload } : payload),
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

  return (
    <Modal title={isEdit ? "Редагувати послугу" : "Нова послуга"} onClose={onClose}>
      <Field label="Назва">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва послуги" />
      </Field>

      {/* Category */}
      <Field label="Група">
        {showNewCategory ? (
          <div className="flex gap-2">
            <Input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Нова група"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }}
              className="px-3 rounded-xl border border-black/10 bg-white text-[12px] text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              Скасувати
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="flex-1 min-w-0">
              <SearchableSelect
                items={categories}
                selectedId={categoryId}
                onSelect={setCategoryId}
                placeholder="— без групи —"
                title="Група послуги"
                renderItem={(c) => <span className="text-[14px] text-gray-900 truncate">{c.name}</span>}
                renderSelected={(c) => <span className="text-[14px] text-gray-900 font-medium">{c.name}</span>}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="px-3 rounded-xl border border-black/10 bg-white text-[12px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors"
            >
              + Нова
            </button>
          </div>
        )}
      </Field>

      {/* Pricing mode toggle */}
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Модель ціни
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setPricingMode("fixed")}
            className={`active:scale-[0.97] text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
              pricingMode === "fixed"
                ? "border-brand-500 bg-brand-50/50"
                : "border-transparent bg-gray-50 hover:border-gray-200"
            }`}
          >
            <div className="text-[12px] font-semibold text-gray-900">💰 Фікс. ціна</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Одна сума за роботу</div>
          </button>
          <button
            type="button"
            onClick={() => setPricingMode("hourly")}
            className={`active:scale-[0.97] text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
              pricingMode === "hourly"
                ? "border-brand-500 bg-brand-50/50"
                : "border-transparent bg-gray-50 hover:border-gray-200"
            }`}
          >
            <div className="text-[12px] font-semibold text-gray-900">⏱ Погодинна</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Ставка × години</div>
          </button>
        </div>
      </div>

      {/* Pricing fields — conditional on mode. Без матеріалів тут, матеріал
          йде окремою секцією нижче (з калькулятором або ручним полем). */}
      {pricingMode === "fixed" ? (
        <Field label="Ціна роботи">
          <Input type="number" inputMode="decimal" value={workPrice} onChange={(e) => setWorkPrice(e.target.value)} placeholder="0" className="tabular-nums no-spin" />
        </Field>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ставка / год">
            <Input type="number" inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0" className="tabular-nums no-spin" />
          </Field>
          <Field label="К-сть годин">
            <Input type="number" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className="tabular-nums no-spin" />
          </Field>
        </div>
      )}

      {/* Materials — ручна ціна АБО калькулятор.  */}
      <div className="rounded-xl border border-black/[0.06] bg-gray-50/40 p-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer select-none mb-2">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-gray-900">Калькуляція матеріалів</div>
            <div className="text-[11px] text-gray-400">Порахувати вартість зі списку + кількості</div>
          </div>
          <div className="relative shrink-0">
            <input
              type="checkbox"
              checked={hasCalculator}
              onChange={(e) => setHasCalculator(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-brand-500 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
          </div>
        </label>

        {hasCalculator ? (
          <div className="space-y-2">
            {!materialsLoaded ? (
              <div className="text-[12px] text-gray-400 py-3 text-center">Завантажую матеріали…</div>
            ) : materials.length === 0 ? (
              <div className="text-[12px] text-gray-400 py-3 text-center">
                Немає матеріалів у каталозі. Додайте матеріали в Налаштуваннях.
              </div>
            ) : (
              <>
                {calcRows.length > 0 && (
                  <div className="space-y-2">
                    {calcRows.map((row, idx) => {
                      const mat = materialById.get(row.materialId);
                      const unitCost =
                        mat && mat.totalVolume > 0
                          ? (row.qty * mat.salePrice) / mat.totalVolume
                          : 0;
                      const unit = mat?.unit ? mat.unit : "мл/шт";
                      return (
                        <div key={idx} className="bg-white rounded-lg border border-black/[0.06] p-2.5 relative">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 text-[10px] cursor-pointer transition-colors"
                            title="Прибрати"
                          >
                            ✕
                          </button>
                          <div className="mb-2 pr-6">
                            <SearchableSelect
                              items={materials}
                              selectedId={row.materialId}
                              onSelect={(id) => updateRow(idx, { materialId: id })}
                              placeholder="Пошук матеріалу…"
                              renderItem={(m) => (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[14px] text-gray-900 truncate">{m.name}</span>
                                  <span className="text-[12px] text-gray-400 whitespace-nowrap tabular-nums">{m.totalVolume} мл/шт</span>
                                </div>
                              )}
                              renderSelected={(m) => (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[14px] text-gray-900 truncate">{m.name}</span>
                                  <span className="text-[12px] text-gray-400 whitespace-nowrap tabular-nums">{m.totalVolume} мл/шт</span>
                                </div>
                              )}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1">
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={row.qty || ""}
                                onChange={(e) => updateRow(idx, { qty: parseFloat(e.target.value) || 0 })}
                                placeholder={`Кількість (${unit})`}
                                className="tabular-nums no-spin"
                              />
                            </div>
                            <div className="w-[80px] text-right text-[13px] tabular-nums">
                              {unitCost > 0 ? (
                                <span className="font-medium text-gray-700">{fmt(Math.round(unitCost))}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addRow}
                  className="w-full h-[36px] rounded-lg border border-dashed border-brand-300 text-[12px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors"
                >
                  <span className="text-[14px] leading-none">+</span> Додати матеріал
                </button>

                {/* Summary: sale / cost */}
                <div className="mt-2 flex items-center justify-between px-2 pt-2 border-t border-black/[0.06] text-[12px]">
                  <span className="text-gray-500">
                    Вартість матеріалів <span className="text-gray-400">(живий прайс)</span>
                  </span>
                  <span className="font-semibold text-brand-600 tabular-nums">
                    {fmt(Math.round(calcTotals.sale))}
                  </span>
                </div>
                {calcTotals.purchase > 0 && (
                  <div className="flex items-center justify-between px-2 text-[11px] text-gray-400">
                    <span>у т.ч. собівартість</span>
                    <span className="tabular-nums">{fmt(Math.round(calcTotals.purchase))}</span>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <Field label="Вартість матеріалів (ручна)">
            <Input
              type="number"
              inputMode="decimal"
              value={materialsCost}
              onChange={(e) => setMaterialsCost(e.target.value)}
              placeholder="0"
              className="tabular-nums no-spin"
            />
          </Field>
        )}
      </div>

      <Field label="Тривалість (хвилин)">
        <Input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="напр. 60" className="tabular-nums no-spin" />
      </Field>

      {/* Price preview */}
      {preview.total > 0 && (
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Розрахунок</div>
          <div className="space-y-1 text-[13px]">
            <div className="flex justify-between">
              <span className="text-gray-500">
                {preview.isHourly
                  ? `Робота (${fmt(preview.rate)} × ${preview.hours} год)`
                  : "Робота (фікс.)"}
              </span>
              <span className="text-gray-900 tabular-nums font-medium">{fmt(preview.work)}</span>
            </div>
            {preview.materials > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">
                  Матеріали{hasCalculator ? " (калькул.)" : ""}
                </span>
                <span className="text-gray-900 tabular-nums font-medium">{fmt(preview.materials)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-black/5">
              <span className="text-gray-900 font-semibold">Всього</span>
              <span className="text-brand-600 font-bold tabular-nums">{fmt(preview.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Active / inactive toggle */}
      {isEdit && (
        <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-brand-500 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
          </div>
          <div>
            <div className="text-[13px] text-gray-900 font-medium">
              {isActive ? "Активна" : "Виведена з каталогу"}
            </div>
            <div className="text-[11px] text-gray-400">
              {isActive ? "Показується при створенні записів" : "Не пропонується при створенні записів"}
            </div>
          </div>
        </label>
      )}

      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} fullWidth size="lg">
        {saving ? "Зберігаю…" : isEdit ? "Зберегти зміни" : "Додати"}
      </Button>
    </Modal>
  );
}
