"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { inputCls, selectCls, labelCls } from "./ui";
import { useSettings, useSpecializations, useCategories } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";

interface Specialist {
  id: string;
  name: string;
  role?: string;
  compensationType?: "commission" | "hourly" | "rental" | "salary";
  rentalRate?: number;
  hourlyRate?: number;
  specializationIds?: string[];
}

interface ServiceCatalogItem {
  id: string;
  name: string;
  workPrice: number;
  materialsCost: number;
  materialsPurchaseCost: number;
  hourlyRate: number;
  hours: number;
  totalPrice: number;
  categoryId: string;
  duration?: number; // в хвилинах, fallback для розрахунку погодинної оплати
}

interface CalcMaterial {
  id: string;
  name: string;
  totalVolume: number;
  totalCost: number;   // sell price per package
  costPrice: number;   // purchase price per package (закупка)
  pricePerUnit: number;
  costPerUnit: number; // costPrice / totalVolume
}

interface MaterialUsage {
  materialId: string;
  amount: number;
}


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
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
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
          <span className="text-[12px] font-semibold text-brand-600 tabular-nums">{fmt(Math.round(totalCalcCost))}</span>
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
                      <span className="text-[14px] font-medium text-gray-700 tabular-nums">{fmt(Math.round(cost))}</span>
                    ) : (
                      <span className="text-[13px] text-gray-300">{fmt(0)}</span>
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
  const { settings } = useSettings();
  // include archived — a linked-but-archived спеціалізація still gives the
  // specialist service access until the owner explicitly unlinks it.
  const { specializations } = useSpecializations(true);
  const { categories: allCategories } = useCategories(true);
  const fmt = moneyFormatter(settings);

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    allCategories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [allCategories]);
  // Identify "Оренда" by name match (case-insensitive). Single source of truth
  // is the Категорії table, but rental behaviour is a system concept — MVP
  // flags it by name. Later: move to a `isRental` flag on categories.
  const rentalCategoryId = useMemo(
    () => allCategories.find((c) => c.name.trim().toLowerCase() === "оренда")?.id || "",
    [allCategories],
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [specialistId, setSpecialistId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [supplement, setSupplement] = useState("");
  const [supplementSign, setSupplementSign] = useState<"+" | "-">("+");
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

  const isRental = selectedSpecialist?.compensationType === "rental";
  const isHourlySpec = selectedSpecialist?.compensationType === "hourly";

  // For rental specialists: auto-select the first "Оренда" service
  // and pre-fill its price from the specialist card.
  useEffect(() => {
    if (!isRental || !services.length || !rentalCategoryId) return;
    const rentalService = services.find((s) => s.categoryId === rentalCategoryId);
    if (rentalService && serviceId !== rentalService.id) {
      setServiceId(rentalService.id);
    }
  }, [isRental, services, rentalCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Override price for rental: comes from specialist card, not catalog.
  const rentalPrice = isRental ? (selectedSpecialist?.rentalRate ?? 0) : null;
  // Hourly specialist's rate from card (₴/hour)
  const specHourlyRate = isHourlySpec ? (selectedSpecialist?.hourlyRate ?? 0) : 0;

  const filteredServices = useMemo(() => {
    // Rental specialists: only show "Оренда" category — no regular services.
    if (isRental) return services.filter((s) => s.categoryId === rentalCategoryId);
    // "Показати всі" toggle — override specialization-based filter (works for any comp type)
    if (showAllServices) {
      return isHourlySpec ? services.filter((s) => s.categoryId !== rentalCategoryId) : services;
    }
    // Resolve allowed categories from the specialist's linked Спеціалізації.
    // Union of categoryIds across all of their specializations.
    const specIds = selectedSpecialist?.specializationIds || [];
    const allowedCatIds = new Set<string>();
    specIds.forEach((id) => {
      const spec = specializations.find((s) => s.id === id);
      spec?.categoryIds.forEach((c) => allowedCatIds.add(c));
    });

    // No specializations configured → show all (avoid empty list for misconfigured specs)
    if (allowedCatIds.size === 0) {
      return isHourlySpec ? services.filter((s) => s.categoryId !== rentalCategoryId) : services;
    }

    return services.filter((s) => {
      if (s.categoryId === rentalCategoryId) return !isHourlySpec;
      return allowedCatIds.has(s.categoryId);
    });
  }, [services, selectedSpecialist, specializations, showAllServices, isRental, isHourlySpec, rentalCategoryId]);

  const preview = useMemo(() => {
    if (!selectedService) return null;
    // isHourly: service priced per hour (catalog-level, for ALL specialist types)
    const isHourlySvc = !isRental && selectedService.hours > 0;
    const rawSuppl = parseFloat(supplement) || 0;
    const suppl = supplementSign === "-" ? -Math.abs(rawSuppl) : Math.abs(rawSuppl);
    let work: number;
    let rate = 0;
    let hrs = 0;

    if (isRental) {
      work = (rentalPrice ?? 0) + suppl;
    } else if (isHourlySvc) {
      rate = selectedService.hourlyRate || 0;
      hrs = selectedService.hours + (parseFloat(extraHours) || 0);
      work = rate * hrs + suppl;
    } else {
      work = (selectedService.workPrice || 0) + suppl;
    }

    const baseMat = selectedService.materialsCost || 0;
    const calcCost = calcMaterials.reduce((s, u) => {
      const m = materials.find((x) => x.id === u.materialId);
      return !m || u.amount <= 0 ? s : s + (u.amount * m.totalCost) / m.totalVolume;
    }, 0);
    const totalMat = baseMat + Math.round(calcCost);

    // For hourly specialist: master pay = spec rate × actual hours worked.
    // Порядок джерел годин: (1) К-сть годин на послузі + додат., (2) тривалість/60 як fallback.
    // Якщо жодного джерела — показуємо попередження і платимо 0 (хай заповнить).
    const extraH = parseFloat(extraHours) || 0;
    const svcHours = selectedService.hours || 0;
    const durH = (selectedService.duration || 0) / 60;
    const fallbackH = svcHours > 0 ? svcHours : durH;
    const totalHrs = isHourlySvc ? hrs : fallbackH + extraH;
    const masterHourlyPay = isHourlySpec
      ? Math.round(specHourlyRate * totalHrs)
      : null;

    return {
      work, baseMat, calcCost: Math.round(calcCost), totalMat,
      total: work + totalMat,
      hrs: totalHrs,
      rate, isHourlySvc, masterHourlyPay,
    };
  }, [selectedService, supplement, extraHours, calcMaterials, materials, isRental, isHourlySpec, specHourlyRate, rentalPrice, supplementSign]);

  async function handleSubmit() {
    setError("");
    if (!serviceId) { setError("Оберіть послугу"); return; }
    if (!specialistId) { setError("Оберіть спеціаліста"); return; }

    setSaving(true);
    try {
      const isHourlySvc = !isRental && selectedService && selectedService.hours > 0;
      // Джерело годин: К-сть годин або тривалість/60 як fallback. Узгоджено з прев'ю.
      const svcHours = selectedService?.hours || 0;
      const durH = (selectedService?.duration || 0) / 60;
      const fallbackH = svcHours > 0 ? svcHours : durH;
      const totalHrs = fallbackH + (parseFloat(extraHours) || 0);
      const masterHourlyPay = isHourlySpec ? Math.round(specHourlyRate * totalHrs) : undefined;

      const body: Record<string, unknown> = {
        type: "service", date, specialistId, serviceId,
        hourlyRate: isHourlySvc ? (selectedService?.hourlyRate || 0) : undefined,
        // Rental: price from specialist card; hourly svc: no fixedPrice; otherwise catalog price.
        fixedPrice: isRental
          ? (rentalPrice ?? 0)
          : !isHourlySvc ? (selectedService?.workPrice || 0) : undefined,
        materialsCost: selectedService?.materialsCost || 0,
        materialsPurchaseCost: selectedService?.materialsPurchaseCost || 0,
        masterHourlyPay,
        comment: comment || undefined,
      };
      const rawSuppl = parseFloat(supplement);
      if (rawSuppl) body.supplement = supplementSign === "-" ? -Math.abs(rawSuppl) : Math.abs(rawSuppl);
      const eh = parseFloat(extraHours);
      if (eh) body.extraHours = eh;
      const valid = calcMaterials
        .filter((m) => m.materialId && m.amount > 0)
        .map((m) => {
          const mat = materials.find((x) => x.id === m.materialId);
          return {
            materialId: m.materialId,
            amount: m.amount,
            // costPerUnit: закупка / Всього мл/шт — snapshot for purchase cost calc
            costPerUnit: mat && mat.totalVolume > 0 ? mat.costPrice / mat.totalVolume : 0,
          };
        });
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
              <label className={labelCls}>{settings?.specialistTerm || "Спеціаліст"}</label>
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

            {/* Service / Rental */}
            {isRental ? (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-amber-800">Оренда робочого місця</div>
                  <div className="text-[12px] text-amber-600 mt-0.5">Сума з картки спеціаліста</div>
                </div>
                <div className="text-[18px] font-bold text-amber-800 tabular-nums">{fmt(rentalPrice ?? 0)}</div>
              </div>
            ) : (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls + " mb-0"}>Послуга</label>
                  {(selectedSpecialist?.specializationIds?.length ?? 0) > 0 && (
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
                  groupBy={(s) => categoryNameById.get(s.categoryId) || "Без категорії"}
                  renderItem={(s) => (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px] text-gray-900 truncate">{s.name}</span>
                      <span className="text-[13px] text-gray-400 whitespace-nowrap tabular-nums">{fmt(s.totalPrice)}</span>
                    </div>
                  )}
                  renderSelected={(s) => (
                    <div>
                      <div className="text-[14px] text-gray-900 font-medium leading-tight">{s.name}</div>
                      <div className="text-[12px] text-gray-500 mt-0.5 tabular-nums">
                        {s.hours > 0
                          ? `${fmt(s.hourlyRate)} × ${s.hours} год`
                          : `роб. ${fmt(s.workPrice)}`}
                        {s.materialsCost > 0 && ` + мат. ${fmt(s.materialsCost)}`}
                        {" = "}{fmt(s.totalPrice)}
                      </div>
                    </div>
                  )}
                />
              </div>
            )}

            {/* Details (shown when service selected or rental auto-selected) */}
            {(selectedService || isRental) && (
              <>
                <div className="border-t border-black/5 my-5" />

                {/* Supplement — always shown; extra hours hidden for rental */}
                <div className="mb-3">
                  <label className={labelCls}>Доповнення</label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setSupplementSign("+")}
                      className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                        supplementSign === "+" ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-50 text-gray-500 border border-black/5"
                      }`}
                    >
                      + Надбавка
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplementSign("-")}
                      className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                        supplementSign === "-" ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-50 text-gray-500 border border-black/5"
                      }`}
                    >
                      − Знижка
                    </button>
                  </div>
                </div>
                <div className={`gap-3 mb-5 ${isRental ? "flex" : "grid grid-cols-2"}`}>
                  <div className="flex-1">
                    <label className={labelCls}>Сума</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={supplement}
                      onChange={(e) => setSupplement(e.target.value)}
                      placeholder="0"
                      className={`${inputCls} tabular-nums`}
                    />
                  </div>
                  {!isRental && (
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
                  )}
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
                          {isRental
                            ? "Оренда (з картки спеціаліста)"
                            : preview.isHourlySvc
                              ? `Робота (${fmt(preview.rate)} × ${preview.hrs} год${supplement ? ` ${supplementSign === "-" ? "−" : "+"}${supplement}` : ""})`
                              : `Робота (фікс.${supplement ? ` ${supplementSign === "-" ? "−" : "+"}${supplement}` : ""})`}
                        </span>
                        <span className="text-gray-900 tabular-nums font-medium">{fmt(preview.work)}</span>
                      </div>
                      {preview.masterHourlyPay !== null && (
                        <>
                          <div className="flex justify-between text-[12px]">
                            <span className="text-brand-500">
                              Оплата майстру ({fmt(specHourlyRate)} × {preview.hrs} год)
                            </span>
                            <span className="text-brand-600 tabular-nums font-medium">{fmt(preview.masterHourlyPay!)}</span>
                          </div>
                          {preview.hrs === 0 && (
                            <div className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">
                              ⚠️ У цієї послуги не задано тривалість. Введи &laquo;Додат. години&raquo;, інакше оплата майстру буде 0.
                            </div>
                          )}
                        </>
                      )}
                      {preview.totalMat > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">
                            Матеріали
                            {preview.calcCost > 0 && (
                              <span className="text-gray-400"> ({preview.baseMat}+{preview.calcCost})</span>
                            )}
                          </span>
                          <span className="text-gray-900 tabular-nums font-medium">{fmt(preview.totalMat)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-black/5">
                        <span className="text-gray-900 font-semibold">Всього</span>
                        <span className="text-brand-600 font-bold tabular-nums text-[15px]">{fmt(preview.total)}</span>
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
