"use client";

import { useState, useEffect, useRef, useMemo } from "react";

interface Specialist {
  id: string;
  name: string;
  role?: string;
}

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

/* ─── Shared styles ─── */
const inputBase = "w-full rounded-xl border border-black/10 bg-white text-[16px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/10 transition-colors";
const inputCls = `${inputBase} px-3.5 h-[44px]`;
const selectCls = `${inputBase} px-3.5 h-[44px] cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%239ca3af%22%20d%3D%22M2%204l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8`;
const labelCls = "block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5";

/* ─── Searchable Picker ─── */
function SearchablePicker<T extends { id: string }>({
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
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={wrapperRef} className="relative">
      {selected && !open ? (
        <div
          className="w-full rounded-xl border border-brand-200 bg-brand-50/40 px-3.5 py-2.5 flex items-center justify-between cursor-pointer min-h-[44px]"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <div className="flex-1 min-w-0">{renderSelected(selected)}</div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(""); }}
            className="w-6 h-6 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-gray-400 hover:text-gray-600 text-[12px] ml-2 cursor-pointer flex-shrink-0 transition-colors"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={`${inputCls} pl-10`}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-[220px] overflow-y-auto z-50">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-gray-400 text-center">Нічого не знайдено</div>
          ) : grouped ? (
            Array.from(grouped.entries()).map(([group, groupItems]) => (
              <div key={group}>
                <div className="px-3.5 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 sticky top-0 border-b border-black/5">
                  {group}
                </div>
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item.id); setQuery(""); setOpen(false); }}
                    className={`w-full text-left px-3.5 py-2.5 hover:bg-brand-50 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
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
                onClick={() => { onSelect(item.id); setQuery(""); setOpen(false); }}
                className={`w-full text-left px-3.5 py-2.5 hover:bg-brand-50 cursor-pointer transition-colors border-b border-black/[0.03] last:border-0 ${
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

/* ─── Calculation Materials ─── */
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

  const totalCalcCost = usages.reduce((sum, u) => {
    const mat = materials.find((m) => m.id === u.materialId);
    if (!mat || u.amount <= 0) return sum;
    return sum + (u.amount * mat.totalCost) / mat.totalVolume;
  }, 0);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className={labelCls + " mb-0"}>Додаткові матеріали</span>
        {totalCalcCost > 0 && (
          <span className="text-[12px] font-semibold text-brand-600 tabular-nums">{Math.round(totalCalcCost)} ₴</span>
        )}
      </div>

      {usages.length > 0 && (
        <div className="space-y-2 mb-3">
          {usages.map((usage, index) => {
            const mat = materials.find((m) => m.id === usage.materialId);
            const cost = mat && usage.amount > 0 ? (usage.amount * mat.totalCost) / mat.totalVolume : 0;

            return (
              <div key={index} className="bg-gray-50/80 rounded-xl p-3 relative group">
                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => onChange(usages.filter((_, i) => i !== index))}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/5 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 text-[11px] cursor-pointer transition-colors"
                >
                  ✕
                </button>

                {/* Material select */}
                <select
                  value={usage.materialId}
                  onChange={(e) => {
                    const updated = [...usages];
                    updated[index] = { ...updated[index], materialId: e.target.value };
                    onChange(updated);
                  }}
                  className={`${selectCls} mb-2`}
                >
                  <option value="">Оберіть матеріал</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.totalVolume} мл/шт)
                    </option>
                  ))}
                </select>

                {/* Amount + cost in one row */}
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={usage.amount || ""}
                      onChange={(e) => {
                        const updated = [...usages];
                        updated[index] = { ...updated[index], amount: parseFloat(e.target.value) || 0 };
                        onChange(updated);
                      }}
                      placeholder="Кількість (мл/шт)"
                      className={inputCls}
                    />
                  </div>
                  <div className="w-[70px] text-right flex-shrink-0">
                    {cost > 0 ? (
                      <span className="text-[14px] font-medium text-gray-700 tabular-nums">{Math.round(cost)} ₴</span>
                    ) : (
                      <span className="text-[13px] text-gray-300">0 ₴</span>
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
        onClick={addMaterial}
        className="w-full h-[40px] rounded-xl border border-dashed border-brand-300 text-[13px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors flex items-center justify-center gap-1"
      >
        <span className="text-[16px] leading-none">+</span> Додати матеріал
      </button>
    </div>
  );
}

/* ─── Main Modal ─── */
export default function ServiceEntryModal({
  specialists,
  onClose,
  onCreated,
}: {
  specialists: Specialist[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [specialistId, setSpecialistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [supplement, setSupplement] = useState("");
  const [extraHours, setExtraHours] = useState("");
  const [calcMaterials, setCalcMaterials] = useState<MaterialUsage[]>([]);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [materials, setMaterials] = useState<CalcMaterial[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/services-catalog").then((r) => r.json()),
      fetch("/api/materials").then((r) => r.json()),
    ])
      .then(([svc, mat]) => { setServices(svc); setMaterials(mat); setLoadingData(false); })
      .catch(() => setLoadingData(false));
  }, []);

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedSpecialist = specialists.find((s) => s.id === specialistId);
  const [showAllServices, setShowAllServices] = useState(false);

  const filteredServices = useMemo(() => {
    if (!selectedSpecialist?.role || showAllServices) return services;
    const cats = ROLE_CATEGORIES[selectedSpecialist.role];
    if (!cats) return services;
    return services.filter((s) => cats.includes(s.category));
  }, [services, selectedSpecialist, showAllServices]);

  const preview = useMemo(() => {
    if (!selectedService) return null;
    const rate = selectedService.hourlyRate || 0;
    const hrs = selectedService.hours + (parseFloat(extraHours) || 0);
    const suppl = parseFloat(supplement) || 0;
    const work = rate * hrs + suppl;
    const baseMat = selectedService.materialsCost || 0;
    const calcCost = calcMaterials.reduce((s, u) => {
      const m = materials.find((x) => x.id === u.materialId);
      return !m || u.amount <= 0 ? s : s + (u.amount * m.totalCost) / m.totalVolume;
    }, 0);
    const totalMat = baseMat + Math.round(calcCost);
    return { work, baseMat, calcCost: Math.round(calcCost), totalMat, total: work + totalMat, hrs, rate };
  }, [selectedService, supplement, extraHours, calcMaterials, materials]);

  async function handleSubmit() {
    setError("");
    if (!serviceId) { setError("Оберіть послугу"); return; }
    if (!specialistId) { setError("Оберіть спеціаліста"); return; }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: "service", date, specialistId, serviceId,
        hourlyRate: selectedService?.hourlyRate || 0,
        materialsCost: selectedService?.materialsCost || 0,
        comment: comment || undefined,
      };
      const suppl = parseFloat(supplement);
      if (suppl) body.supplement = suppl;
      const eh = parseFloat(extraHours);
      if (eh) body.extraHours = eh;
      const valid = calcMaterials.filter((m) => m.materialId && m.amount > 0);
      if (valid.length > 0) body.calcMaterials = valid;

      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      await new Promise((r) => setTimeout(r, 800));
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
        className="bg-white w-full sm:w-[440px] sm:rounded-2xl rounded-t-2xl p-5 pb-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[17px] font-semibold text-gray-900">Нова послуга</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {loadingData ? (
          <div className="py-12 text-center text-[13px] text-gray-400">Завантаження...</div>
        ) : (
          <>
            {/* Date */}
            <div className="mb-4">
              <label className={labelCls}>Дата</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>

            {/* Specialist */}
            <div className="mb-4">
              <label className={labelCls}>Спеціаліст</label>
              <select
                value={specialistId}
                onChange={(e) => { setSpecialistId(e.target.value); setServiceId(""); setShowAllServices(false); }}
                className={selectCls}
              >
                <option value="">Оберіть спеціаліста</option>
                {specialists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Service */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className={labelCls + " mb-0"}>Послуга</label>
                {selectedSpecialist?.role && ROLE_CATEGORIES[selectedSpecialist.role] && (
                  <button
                    type="button"
                    onClick={() => setShowAllServices(!showAllServices)}
                    className="text-[11px] text-brand-500 hover:text-brand-700 cursor-pointer font-medium"
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] text-gray-900 truncate">{s.name}</span>
                    <span className="text-[13px] text-gray-400 whitespace-nowrap tabular-nums">{s.totalPrice} ₴</span>
                  </div>
                )}
                renderSelected={(s) => (
                  <div>
                    <div className="text-[14px] text-gray-900 font-medium leading-tight">{s.name}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5 tabular-nums">
                      {s.hourlyRate} ₴ × {s.hours} год
                      {s.materialsCost > 0 && ` + мат. ${s.materialsCost} ₴`}
                      {" = "}{s.totalPrice} ₴
                    </div>
                  </div>
                )}
              />
            </div>

            {/* Details (shown when service selected) */}
            {selectedService && (
              <>
                {/* Divider */}
                <div className="border-t border-black/5 my-5" />

                {/* Supplement & Extra Hours - same height */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className={labelCls}>Доповнення (±)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={supplement}
                      onChange={(e) => setSupplement(e.target.value)}
                      placeholder="0"
                      className={`${inputCls} tabular-nums`}
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Додат. години</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={extraHours}
                      onChange={(e) => setExtraHours(e.target.value)}
                      placeholder="0"
                      className={`${inputCls} tabular-nums`}
                    />
                  </div>
                </div>

                {/* Calculation Materials */}
                <CalcMaterialsSection
                  materials={materials}
                  usages={calcMaterials}
                  onChange={setCalcMaterials}
                />

                {/* Price Preview */}
                {preview && (
                  <div className="mb-5 bg-gray-50 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">Розрахунок</div>
                    <div className="space-y-1.5 text-[13px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">
                          Робота ({preview.rate} × {preview.hrs} год
                          {supplement ? ` ${parseFloat(supplement) > 0 ? "+" : ""}${supplement}` : ""})
                        </span>
                        <span className="text-gray-900 tabular-nums font-medium">{preview.work} ₴</span>
                      </div>
                      {preview.totalMat > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Матеріали
                            {preview.calcCost > 0 && (
                              <span className="text-gray-400"> ({preview.baseMat}+{preview.calcCost})</span>
                            )}
                          </span>
                          <span className="text-gray-900 tabular-nums font-medium">{preview.totalMat} ₴</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-black/5">
                        <span className="text-gray-900 font-semibold">Всього</span>
                        <span className="text-brand-600 font-bold tabular-nums text-[15px]">{preview.total} ₴</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Comment */}
            <div className="mb-5">
              <label className={labelCls}>Коментар</label>
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Необов'язково"
                className={inputCls}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 text-[13px] text-red-600 bg-red-50 rounded-xl px-4 py-2.5">{error}</div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full h-[48px] bg-brand-600 text-white rounded-xl font-semibold text-[16px] cursor-pointer hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Збереження..." : "Зберегти"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
