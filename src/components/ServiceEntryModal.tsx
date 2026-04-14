"use client";

import { useState, useEffect, useRef, useMemo } from "react";

interface Specialist {
  id: string;
  name: string;
  role?: string;
}

// Mapping: specialist role → allowed service categories
const ROLE_CATEGORIES: Record<string, string[]> = {
  "Перукарі": ["Фарбування", "Стрижки", "Лікування", "Зачіски, укладки"],
  "Візажисти, бровісти": ["Брови", "Мейкап"],
  "Нігтьовий сервіс": ["Нігтьовий сервіс"],
};

interface ServiceCatalogItem {
  id: string;
  name: string;
  workPrice: number;
  materialsCost: number;
  hourlyRate: number;
  hours: number;
  totalPrice: number;
  category: string;
}

interface CalcMaterial {
  id: string;
  name: string;
  totalVolume: number;
  totalCost: number;
  pricePerUnit: number;
}

interface MaterialUsage {
  materialId: string;
  amount: number;
}

// iOS-safe input class: font-size 16px prevents zoom on focus
const INPUT_CLS =
  "w-full border border-black/10 rounded-lg px-3 py-2.5 text-[16px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20";
const SELECT_CLS =
  "w-full border border-black/10 rounded-lg px-3 py-2.5 text-[16px] text-gray-900 bg-white focus:border-brand-500 focus:outline-none cursor-pointer";
const LABEL_CLS = "text-[11px] font-medium text-gray-500 uppercase tracking-wider";

/* ─── Searchable Picker (reusable) ─── */
function SearchablePicker<T extends { id: string; name?: string }>({
  items,
  selectedId,
  onSelect,
  placeholder,
  renderItem,
  renderSelected,
  groupBy,
}: {
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder: string;
  renderItem: (item: T) => React.ReactNode;
  renderSelected: (item: T) => React.ReactNode;
  groupBy?: (item: T) => string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === selectedId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((i) => {
      const name = (i as Record<string, unknown>).name as string || "";
      return name.toLowerCase().includes(q);
    });
  }, [items, query]);

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const groups = new Map<string, T[]>();
    filtered.forEach((item) => {
      const g = groupBy(item) || "Інше";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(item);
    });
    return groups;
  }, [filtered, groupBy]);

  function handleSelect(item: T) {
    onSelect(item.id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative mt-1">
      {selected && !open ? (
        <div
          className="w-full border border-brand-200 bg-brand-50/50 rounded-lg px-3 py-2.5 flex items-center justify-between cursor-pointer"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <div className="flex-1 min-w-0">{renderSelected(selected)}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); }}
            className="text-gray-400 hover:text-gray-600 text-[18px] ml-2 cursor-pointer flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${INPUT_CLS} pl-9`}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-[240px] overflow-y-auto z-50">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-gray-400">Нічого не знайдено</div>
          ) : grouped ? (
            Array.from(grouped.entries()).map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">
                  {group}
                </div>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={`w-full text-left px-3 py-2 hover:bg-brand-50 cursor-pointer transition-colors ${
                      item.id === selectedId ? "bg-brand-50" : ""
                    }`}
                  >
                    {renderItem(item)}
                  </button>
                ))}
              </div>
            ))
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={`w-full text-left px-3 py-2 hover:bg-brand-50 cursor-pointer transition-colors ${
                  item.id === selectedId ? "bg-brand-50" : ""
                }`}
              >
                {renderItem(item)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Calculation Materials Section ─── */
function CalcMaterialsSection({
  materials,
  usages,
  onChange,
}: {
  materials: CalcMaterial[];
  usages: MaterialUsage[];
  onChange: (usages: MaterialUsage[]) => void;
}) {
  function addMaterial() {
    onChange([...usages, { materialId: "", amount: 0 }]);
  }

  function removeMaterial(index: number) {
    onChange(usages.filter((_, i) => i !== index));
  }

  function updateMaterial(index: number, field: "materialId" | "amount", value: string | number) {
    const updated = [...usages];
    if (field === "materialId") {
      updated[index] = { ...updated[index], materialId: value as string };
    } else {
      updated[index] = { ...updated[index], amount: value as number };
    }
    onChange(updated);
  }

  const totalCalcCost = usages.reduce((sum, u) => {
    const mat = materials.find((m) => m.id === u.materialId);
    if (!mat || u.amount <= 0) return sum;
    return sum + (u.amount * mat.totalCost) / mat.totalVolume;
  }, 0);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className={LABEL_CLS}>Калькуляція матеріалів</span>
        {totalCalcCost > 0 && (
          <span className="text-[12px] font-medium text-brand-600">{Math.round(totalCalcCost)} ₴</span>
        )}
      </div>

      {usages.map((usage, index) => {
        const mat = materials.find((m) => m.id === usage.materialId);
        const cost = mat && usage.amount > 0 ? (usage.amount * mat.totalCost) / mat.totalVolume : 0;

        return (
          <div key={index} className="flex gap-2 mb-2 items-start">
            <div className="flex-1 min-w-0">
              <select
                value={usage.materialId}
                onChange={(e) => updateMaterial(index, "materialId", e.target.value)}
                className={`${SELECT_CLS} text-[14px] py-2`}
              >
                <option value="">Матеріал...</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.totalVolume} мл)
                  </option>
                ))}
              </select>
            </div>
            <div className="w-[70px] flex-shrink-0">
              <input
                type="number"
                inputMode="decimal"
                value={usage.amount || ""}
                onChange={(e) => updateMaterial(index, "amount", parseFloat(e.target.value) || 0)}
                placeholder="мл"
                className={`${INPUT_CLS} text-[14px] py-2 px-2 text-center`}
              />
            </div>
            <div className="w-[55px] flex-shrink-0 text-right pt-2">
              {cost > 0 && <span className="text-[12px] text-gray-500">{Math.round(cost)} ₴</span>}
            </div>
            <button
              type="button"
              onClick={() => removeMaterial(index)}
              className="text-gray-400 hover:text-red-500 text-[16px] pt-2 cursor-pointer flex-shrink-0"
            >
              ✕
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addMaterial}
        className="text-[13px] text-brand-600 hover:text-brand-700 font-medium cursor-pointer"
      >
        + Додати матеріал
      </button>
    </div>
  );
}

/* ─── Main Service Entry Modal ─── */
export default function ServiceEntryModal({
  specialists,
  onClose,
  onCreated,
}: {
  specialists: Specialist[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [specialistId, setSpecialistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [supplement, setSupplement] = useState("");
  const [extraHours, setExtraHours] = useState("");
  const [calcMaterials, setCalcMaterials] = useState<MaterialUsage[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Data
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [materials, setMaterials] = useState<CalcMaterial[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch catalog data
  useEffect(() => {
    Promise.all([
      fetch("/api/services-catalog").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
    ])
      .then(([svc, mat]) => {
        setServices(svc);
        setMaterials(mat);
        setLoadingData(false);
      })
      .catch(() => setLoadingData(false));
  }, []);

  const selectedService = services.find((s) => s.id === serviceId);

  // Filter services by specialist's specialization
  const selectedSpecialist = specialists.find((s) => s.id === specialistId);
  const [showAllServices, setShowAllServices] = useState(false);

  const filteredServices = useMemo(() => {
    if (!selectedSpecialist?.role || showAllServices) return services;
    const allowedCategories = ROLE_CATEGORIES[selectedSpecialist.role];
    if (!allowedCategories) return services;
    return services.filter((s) => allowedCategories.includes(s.category));
  }, [services, selectedSpecialist, showAllServices]);

  // Calculate preview
  const preview = useMemo(() => {
    if (!selectedService) return null;

    const hourlyRate = selectedService.hourlyRate || 0;
    const hours = selectedService.hours + (parseFloat(extraHours) || 0);
    const suppl = parseFloat(supplement) || 0;
    const workCost = hourlyRate * hours + suppl;
    const baseMaterials = selectedService.materialsCost || 0;

    const calcCost = calcMaterials.reduce((sum, u) => {
      const mat = materials.find((m) => m.id === u.materialId);
      if (!mat || u.amount <= 0) return sum;
      return sum + (u.amount * mat.totalCost) / mat.totalVolume;
    }, 0);

    const totalMaterials = baseMaterials + Math.round(calcCost);
    const total = workCost + totalMaterials;

    return { workCost, baseMaterials, calcCost: Math.round(calcCost), totalMaterials, total, hours, hourlyRate };
  }, [selectedService, supplement, extraHours, calcMaterials, materials]);

  async function handleSubmit() {
    setError("");

    if (!serviceId) { setError("Оберіть послугу"); return; }
    if (!specialistId) { setError("Оберіть спеціаліста"); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: "service",
        date,
        specialistId,
        serviceId,
        hourlyRate: selectedService?.hourlyRate || 0,
        materialsCost: selectedService?.materialsCost || 0,
        comment: comment || undefined,
      };

      const suppl = parseFloat(supplement);
      if (suppl) body.supplement = suppl;

      const eh = parseFloat(extraHours);
      if (eh) body.extraHours = eh;

      // Calculation materials → create Замовлення records
      const validMaterials = calcMaterials.filter((m) => m.materialId && m.amount > 0);
      if (validMaterials.length > 0) {
        body.calcMaterials = validMaterials;
      }

      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[460px] sm:rounded-2xl rounded-t-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-gray-900">Нова послуга</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {loadingData ? (
          <div className="py-8 text-center text-[13px] text-gray-400">Завантаження...</div>
        ) : (
          <>
            {/* Date */}
            <label className="block mb-4">
              <span className={LABEL_CLS}>Дата</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${INPUT_CLS}`} />
            </label>

            {/* Specialist */}
            <label className="block mb-4">
              <span className={LABEL_CLS}>Спеціаліст</span>
              <select
                value={specialistId}
                onChange={(e) => { setSpecialistId(e.target.value); setServiceId(""); setShowAllServices(false); }}
                className={`mt-1 ${SELECT_CLS}`}
              >
                <option value="">Оберіть спеціаліста</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* Service */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <span className={LABEL_CLS}>Послуга</span>
                {selectedSpecialist?.role && ROLE_CATEGORIES[selectedSpecialist.role] && (
                  <button
                    type="button"
                    onClick={() => setShowAllServices(!showAllServices)}
                    className="text-[11px] text-brand-500 hover:text-brand-700 cursor-pointer"
                  >
                    {showAllServices ? "Тільки мої" : "Показати всі"}
                  </button>
                )}
              </div>
              <SearchablePicker
                items={filteredServices}
                selectedId={serviceId}
                onSelect={setServiceId}
                placeholder="Пошук послуги..."
                groupBy={(s) => s.category}
                renderItem={(s) => (
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] text-gray-900 truncate mr-2">{s.name}</span>
                    <span className="text-[13px] text-gray-500 whitespace-nowrap">{s.totalPrice} ₴</span>
                  </div>
                )}
                renderSelected={(s) => (
                  <div>
                    <div className="text-[14px] text-gray-900 font-medium">{s.name}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5">
                      {s.hourlyRate} ₴/год × {s.hours} год
                      {s.materialsCost > 0 && <span> + матеріали {s.materialsCost} ₴</span>}
                      {" = "}{s.totalPrice} ₴
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Price details (shown when service selected) */}
            {selectedService && (
              <>
                {/* Supplement & Extra Hours */}
                <div className="flex gap-3 mb-4">
                  <label className="flex-1">
                    <span className={LABEL_CLS}>Доповнення (±)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={supplement}
                      onChange={(e) => setSupplement(e.target.value)}
                      placeholder="0"
                      className={`mt-1 ${INPUT_CLS} tabular-nums`}
                    />
                  </label>
                  <label className="w-[100px] flex-shrink-0">
                    <span className={LABEL_CLS}>Додат. годин</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={extraHours}
                      onChange={(e) => setExtraHours(e.target.value)}
                      placeholder="0"
                      className={`mt-1 ${INPUT_CLS} tabular-nums`}
                    />
                  </label>
                </div>

                {/* Calculation Materials */}
                <CalcMaterialsSection
                  materials={materials}
                  usages={calcMaterials}
                  onChange={setCalcMaterials}
                />

                {/* Price Preview */}
                {preview && (
                  <div className="mb-4 bg-gray-50 rounded-xl p-3">
                    <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Попередній розрахунок</div>
                    <div className="space-y-1 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Робота ({preview.hourlyRate} × {preview.hours} год{supplement ? ` ${parseFloat(supplement) > 0 ? "+" : ""}${supplement}` : ""})</span>
                        <span className="text-gray-900 tabular-nums">{preview.workCost} ₴</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">
                          Матеріали
                          {preview.calcCost > 0 && <span className="text-gray-400"> ({preview.baseMaterials} + {preview.calcCost})</span>}
                        </span>
                        <span className="text-gray-900 tabular-nums">{preview.totalMaterials} ₴</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-black/5 font-medium">
                        <span className="text-gray-900">Всього</span>
                        <span className="text-brand-600 tabular-nums">{preview.total} ₴</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Comment */}
            <label className="block mb-5">
              <span className={LABEL_CLS}>Коментар</span>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Необов'язково"
                className={`mt-1 ${INPUT_CLS}`}
              />
            </label>

            {/* Error */}
            {error && (
              <div className="mb-4 text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-brand-600 text-white rounded-xl font-medium text-[16px] py-3 cursor-pointer hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
