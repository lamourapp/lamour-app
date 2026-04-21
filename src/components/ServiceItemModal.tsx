"use client";

import { useState, useMemo } from "react";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { ServiceCatalogItem } from "@/lib/hooks";
import { useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";

interface Props {
  item?: ServiceCatalogItem | null;
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Price preview
  const preview = useMemo(() => {
    const mat = parseFloat(materialsCost) || 0;

    if (pricingMode === "hourly") {
      const rate = parseFloat(hourlyRate) || 0;
      const h = parseFloat(hours) || 0;
      const work = rate * h;
      return { work, materials: mat, total: work + mat, isHourly: true, rate, hours: h };
    } else {
      const wp = parseFloat(workPrice) || 0;
      return { work: wp, materials: mat, total: wp + mat, isHourly: false, rate: 0, hours: 0 };
    }
  }, [pricingMode, workPrice, hourlyRate, hours, materialsCost]);

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

      if (materialsCost) payload.materialsCost = parseFloat(materialsCost);
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
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="flex-1">
              <option value="">— без групи —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => setShowNewCategory(true)}
              className="px-3 rounded-xl border border-black/10 bg-white text-[12px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors shrink-0"
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
            className={`text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
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
            className={`text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
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

      {/* Pricing fields — conditional on mode */}
      {pricingMode === "fixed" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ціна роботи">
            <Input type="number" inputMode="decimal" value={workPrice} onChange={(e) => setWorkPrice(e.target.value)} placeholder="0" className="tabular-nums" />
          </Field>
          <Field label="Вартість матеріалів">
            <Input type="number" inputMode="decimal" value={materialsCost} onChange={(e) => setMaterialsCost(e.target.value)} placeholder="0" className="tabular-nums" />
          </Field>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ставка / год">
              <Input type="number" inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="0" className="tabular-nums" />
            </Field>
            <Field label="К-сть годин">
              <Input type="number" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className="tabular-nums" />
            </Field>
          </div>
          <Field label="Вартість матеріалів">
            <Input type="number" inputMode="decimal" value={materialsCost} onChange={(e) => setMaterialsCost(e.target.value)} placeholder="0" className="tabular-nums" />
          </Field>
        </>
      )}

      <Field label="Тривалість (хвилин)">
        <Input type="number" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="напр. 60" className="tabular-nums" />
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
                <span className="text-gray-500">Матеріали</span>
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
        {saving ? "Зберігаю..." : isEdit ? "Зберегти зміни" : "Додати"}
      </Button>
    </Modal>
  );
}
