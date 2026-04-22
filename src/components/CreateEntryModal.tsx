"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Field, Input, Label, Modal, Select, inputCls } from "./ui";
import { useSettings, useExpenseTypes } from "@/lib/hooks";
import SingleDatePicker from "./SingleDatePicker";
import { moneyFormatter, todayISO } from "@/lib/format";

interface Specialist {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  costPrice: number;
  group: string;
}

type EntryType = "expense" | "debt" | "sale";

/* ─── Searchable Product Picker ─── */
function ProductPicker({
  products,
  productId,
  onSelect,
}: {
  products: Product[];
  productId: string;
  onSelect: (id: string) => void;
}) {
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = products.find((p) => p.id === productId);

  // Close on Escape; outside-click handled via onBlur on the input below
  // (document-level mousedown used to race with product button clicks on
  // some touch devices and swallowed selection).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.group.toLowerCase().includes(q)
    );
  }, [products, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Product[]>();
    filtered.forEach((p) => {
      const g = p.group || "Інше";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(p);
    });
    return groups;
  }, [filtered]);

  function handleSelect(p: Product) {
    onSelect(p.id);
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onSelect("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      {selected && !open ? (
        <div
          className="w-full h-[44px] border border-brand-200 bg-brand-50/50 rounded-xl px-3.5 flex items-center justify-between cursor-pointer"
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        >
          <div className="min-w-0">
            <div className="text-[14px] text-gray-900 font-medium truncate">{selected.name}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">
              {fmt(selected.price)}{selected.group ? ` · ${selected.group}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="text-gray-400 hover:text-gray-600 text-[18px] ml-2 cursor-pointer"
            aria-label="Очистити"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            🔍
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={(e) => {
              // Close dropdown only if focus moved outside the picker.
              // Product buttons inside wrapperRef receive focus on mousedown,
              // so onBlur fires AFTER button's onClick — selection is safe.
              if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
                setTimeout(() => setOpen(false), 150);
              }
            }}
            placeholder="Пошук товару..."
            className={`${inputCls} pl-9`}
          />
        </div>
      )}

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-black/10 rounded-xl shadow-xl max-h-[240px] overflow-y-auto z-50">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-gray-400">Нічого не знайдено</div>
          ) : (
            Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 sticky top-0">
                  {group}
                </div>
                {items.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    // Prevent input blur before click registers on mobile —
                    // this was the most likely cause of "product won't select".
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(p)}
                    className={`w-full text-left px-3 py-2 hover:bg-brand-50 cursor-pointer transition-colors flex items-center justify-between ${
                      p.id === productId ? "bg-brand-50" : ""
                    }`}
                  >
                    <span className="text-[14px] text-gray-900 truncate mr-2">{p.name}</span>
                    <span className="text-[13px] text-gray-500 whitespace-nowrap">{fmt(p.price)}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Modal ─── */

/**
 * Дані для edit-режиму.
 *
 * Є два різні шляхи залежно від типу:
 *   • expense / debt — PATCH /api/journal (in-place; прості числа, без
 *     пересчитунку линків). `id` → який запис оновити.
 *   • sale          — create-new + cancel-old (той самий pattern що
 *     ServiceEntryModal): POST нового + soft-delete старого. Так, бо
 *     склад продажу (saleDetails, fixedSalePrice, fixedCostPrice,
 *     fixedMasterPctForSale/Salon) — це snapshot-поля, перераховувати
 *     їх PATCH-ом ризиковано. `replaceEntryId` → який запис скасувати.
 */
export interface EntryEditInitial {
  /** id запису, що редагується. Для expense/debt → PATCH (in-place). */
  id: string;
  /** id запису, що скасовується після створення нового. Для sale → cancel-old. */
  replaceEntryId?: string;
  date: string;
  amount?: number;         // додатне число (не перевертаємо знак). Для sale ігнорується — беремо з saleItems.
  expenseType?: string;
  specialistId?: string;
  comment?: string;
  /** Для sale edit — початковий склад і надбавка/знижка. */
  saleItems?: { productId?: string; quantity: number }[];
  supplement?: number;
}

/**
 * Preset для CREATE-mode (не edit). Використовується коли викликаємо
 * модал з контексту (напр., кнопка «Розрахунок» на картці співробітника
 * → відкриває debt-модал з вже заповненим спеціалістом і сумою балансу).
 * Від `initial` відрізняється тим, що не прив'язується до id існуючого
 * запису — ми все одно створюємо новий через POST.
 */
export interface EntryCreatePreset {
  specialistId?: string;
  amount?: number;        // abs, без знаку — знак керується debtSign
  debtSign?: "+" | "-";
  comment?: string;
}

export default function CreateEntryModal({
  type,
  specialists,
  onClose,
  onCreated,
  initial,
  preset,
}: {
  type: EntryType;
  specialists: Specialist[];
  onClose: () => void;
  onCreated: () => void;
  /** Якщо передано — модал у edit-mode, PATCH замість POST. Тільки для expense. */
  initial?: EntryEditInitial;
  /** Пресет для create-mode: попередньо-заповнені поля (використовується
   *  кнопкою «Розрахунок» на картці співробітника). Ігнорується в edit-mode. */
  preset?: EntryCreatePreset;
}) {
  const isEdit = !!initial;
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  // Види витрат: tenant-managed через Settings → Види витрат. Беремо активні;
  // якщо редагуємо запис із неактивним (або перейменованим) видом — додаємо
  // його як disabled-опцію нижче, щоб не загубити значення.
  const { expenseTypes } = useExpenseTypes(false);
  const [date, setDate] = useState(() => initial?.date || todayISO());
  const [amount, setAmount] = useState(() => {
    if (initial?.amount != null) return String(Math.abs(initial.amount));
    if (preset?.amount != null) return String(Math.abs(preset.amount));
    return "";
  });
  const [specialistId, setSpecialistId] = useState(() => initial?.specialistId || preset?.specialistId || "");
  const [expenseType, setExpenseType] = useState(() => initial?.expenseType || "");
  const [comment, setComment] = useState(() => initial?.comment || preset?.comment || "");
  const [saleItems, setSaleItems] = useState<{ productId: string; quantity: number }[]>(() => {
    if (initial?.saleItems && initial.saleItems.length > 0) {
      return initial.saleItems.map((si) => ({
        productId: si.productId || "",
        quantity: si.quantity || 1,
      }));
    }
    return [{ productId: "", quantity: 1 }];
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [supplement, setSupplement] = useState(() =>
    initial?.supplement ? String(Math.abs(initial.supplement)) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [debtSign, setDebtSign] = useState<"+" | "-">(preset?.debtSign || "+");

  useEffect(() => {
    if (type === "sale") {
      fetch("/api/products")
        .then((r) => r.json())
        .then((data) => setProducts(data))
        .catch(() => {});
    }
  }, [type]);

  const [supplementSign, setSupplementSign] = useState<"+" | "-">(
    initial?.supplement && initial.supplement < 0 ? "-" : "+"
  );

  // Sale preview with multi-product support
  const salePreview = useMemo(() => {
    if (type !== "sale") return null;
    const lines = saleItems
      .filter((si) => si.productId && si.quantity > 0)
      .map((si) => {
        const p = products.find((pr) => pr.id === si.productId);
        if (!p) return null;
        return { name: p.name, price: p.price, costPrice: p.costPrice, quantity: si.quantity, lineTotal: p.price * si.quantity };
      })
      .filter(Boolean) as { name: string; price: number; costPrice: number; quantity: number; lineTotal: number }[];

    if (lines.length === 0) return null;
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const suppl = parseFloat(supplement) || 0;
    const signedSuppl = supplementSign === "-" ? -Math.abs(suppl) : Math.abs(suppl);
    return { lines, subtotal, supplement: signedSuppl, total: subtotal + signedSuppl };
  }, [type, saleItems, products, supplement, supplementSign]);

  async function handleSubmit() {
    setError("");

    if (type === "expense" && !amount) { setError("Вкажіть суму"); return; }
    if (type === "debt") {
      if (!amount) { setError("Вкажіть суму"); return; }
      if (!specialistId) { setError("Оберіть спеціаліста"); return; }
    }
    if (type === "sale") {
      if (!saleItems.some((si) => si.productId && si.quantity > 0)) { setError("Додайте хоча б один товар"); return; }
      if (!specialistId) { setError("Оберіть спеціаліста"); return; }
    }

    setSaving(true);
    try {
      // Sale edit = create-new + cancel-old. PATCH не підходить бо склад
      // продажу — це набір snapshot-полів + linked saleDetails, які треба
      // перестворити. Шлях нижче падає в POST-гілку, яка вже вміє multi-product.
      // Після успішного створення — soft-delete старого запису.
      // Це те саме, що ServiceEntryModal робить для service/rental.
      //
      // Expense/debt edit → легкий PATCH (простих метаданих достатньо).

      // Edit-mode: тільки expense, PATCH з id і явним kind.
      if (isEdit && initial && type === "expense") {
        const patchBody: Record<string, unknown> = {
          id: initial.id,
          kind: "expense",
          date,
          amount: parseFloat(amount),
          // '' → очищення відповідного поля на бекенді (явно, щоб не писати undefined).
          expenseType: expenseType,
          specialistId: specialistId,
          comment: comment,
        };
        const res = await fetch("/api/journal", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed");
        await new Promise((resolve) => setTimeout(resolve, 400));
        onCreated();
        onClose();
        return;
      }

      const body: Record<string, unknown> = { type, date, comment: comment || undefined };

      if (type === "expense") {
        body.amount = parseFloat(amount);
        body.expenseType = expenseType || undefined;
        if (specialistId) body.specialistId = specialistId;
      } else if (type === "debt") {
        const val = parseFloat(amount);
        body.amount = debtSign === "+" ? Math.abs(val) : -Math.abs(val);
        body.specialistId = specialistId;
      } else if (type === "sale") {
        body.specialistId = specialistId;
        if (supplement) {
          const suppl = parseFloat(supplement);
          body.supplement = supplementSign === "-" ? -Math.abs(suppl) : Math.abs(suppl);
        }
        const validItems = saleItems
          .filter((si) => si.productId && si.quantity > 0)
          .map((si) => {
            const p = products.find((pr) => pr.id === si.productId);
            return p ? { productId: si.productId, quantity: si.quantity, salePrice: p.price, costPrice: p.costPrice } : null;
          })
          .filter(Boolean);
        body.saleItems = validItems;
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

      // Sale edit: старий запис soft-скасовуємо. Якщо впаде — лишиться
      // дубль, користувач зможе прибрати вручну; не відкочуємо створення.
      if (isEdit && initial?.replaceEntryId) {
        try {
          await fetch("/api/journal", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: initial.replaceEntryId }),
          });
        } catch (err) {
          console.warn("Cancel of old sale entry failed:", err);
        }
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

  const titles: Record<EntryType, string> = {
    expense: isEdit ? "Редагувати витрату" : "Нова витрата",
    // "Борг" у даних лишається (SERVICE_FIELDS.debtAmount), але в UI єдина
    // сутність «рух з майстром»: аванси, борги, виплати ЗП — все тут.
    debt: "Розрахунок з майстром",
    sale: isEdit ? "Редагувати продаж" : "Новий продаж",
  };

  return (
    <Modal title={titles[type]} onClose={onClose}>
      <Field label="Дата">
        <SingleDatePicker value={date} onChange={setDate} />
      </Field>

      {(type === "debt" || type === "sale" || type === "expense") && (
        <Field
          label={settings?.specialistTerm || "Спеціаліст"}
          hint={type === "expense" ? "(опціонально, для ЗП)" : undefined}
        >
          <Select value={specialistId} onChange={(e) => setSpecialistId(e.target.value)}>
            <option value="">{type === "expense" ? "Не прив'язано" : "Оберіть спеціаліста"}</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "expense" && (
        <Field label="Вид витрати">
          <Select value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
            <option value="">Без категорії</option>
            {expenseTypes.map((t) => (
              <option key={t.id} value={t.name}>{t.name}</option>
            ))}
            {/* Edit-mode fallback: якщо поточне значення відсутнє в активному
                списку (архівоване / перейменоване), додаємо окрему опцію — щоб
                select показав поточне значення, а не скинувся на «Без категорії». */}
            {expenseType && !expenseTypes.some((t) => t.name === expenseType) && (
              <option value={expenseType}>{expenseType} (архів)</option>
            )}
          </Select>
        </Field>
      )}

      {(type === "expense" || type === "debt") && (
        <Field label={type === "debt" ? "Сума" : "Сума"}
          hint={type === "debt"
            ? "+ збільшити наш борг майстру (напр. довнарахували)  ·  − зменшити / виплата ЗП"
            : undefined}
        >
          {type === "debt" && (
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setDebtSign("+")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  debtSign === "+" ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                + ми винні майстру
              </button>
              <button
                type="button"
                onClick={() => setDebtSign("-")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  debtSign === "-" ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                − виплата / майстер віддав
              </button>
            </div>
          )}
          <Input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="tabular-nums"
          />
        </Field>
      )}

      {type === "sale" && (
        <div className="block">
          <Label>Товари</Label>
          <div className="space-y-2">
            {saleItems.map((si, idx) => {
              const product = products.find((p) => p.id === si.productId);
              return (
                <div key={idx} className="bg-gray-50/80 rounded-xl p-3 relative group">
                  {saleItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSaleItems(saleItems.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/5 hover:bg-red-100 flex items-center justify-center text-gray-400 hover:text-red-500 text-[11px] cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  )}
                  <ProductPicker
                    products={products}
                    productId={si.productId}
                    onSelect={(id) => {
                      const updated = [...saleItems];
                      updated[idx] = { ...updated[idx], productId: id };
                      setSaleItems(updated);
                    }}
                  />
                  {product && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-gray-400">К-сть:</label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={si.quantity}
                          onChange={(e) => {
                            const updated = [...saleItems];
                            updated[idx] = { ...updated[idx], quantity: Math.max(1, parseInt(e.target.value) || 1) };
                            setSaleItems(updated);
                          }}
                          className="w-16 px-2 py-1 border border-black/10 rounded-lg text-[13px] text-center tabular-nums"
                        />
                      </div>
                      <div className="text-[12px] text-gray-500 tabular-nums">
                        {si.quantity > 1 ? `${fmt(product.price)} × ${si.quantity} = ` : ""}
                        <span className="font-medium text-gray-700">{fmt(product.price * si.quantity)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setSaleItems([...saleItems, { productId: "", quantity: 1 }])}
            className="mt-2 w-full h-[38px] rounded-xl border border-dashed border-brand-300 text-[13px] font-medium text-brand-600 hover:bg-brand-50 cursor-pointer transition-colors flex items-center justify-center gap-1"
          >
            <span className="text-[16px] leading-none">+</span> Ще товар
          </button>
        </div>
      )}

      {type === "sale" && (
        <Field label="Доповнення">
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
          <Input
            type="number"
            inputMode="decimal"
            value={supplement}
            onChange={(e) => setSupplement(e.target.value)}
            placeholder="0"
            className="tabular-nums"
          />
        </Field>
      )}

      {/* Sale preview */}
      {salePreview && (
        <div className="bg-gray-50 rounded-xl p-3">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Розрахунок</div>
          <div className="space-y-1 text-[13px]">
            {salePreview.lines.map((line, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-500 truncate mr-2">
                  {line.name}{line.quantity > 1 ? ` ×${line.quantity}` : ""}
                </span>
                <span className="text-gray-900 tabular-nums font-medium shrink-0">{fmt(line.lineTotal)}</span>
              </div>
            ))}
            {salePreview.supplement !== 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">{salePreview.supplement > 0 ? "Надбавка" : "Знижка"}</span>
                <span className="text-gray-900 tabular-nums font-medium">
                  {salePreview.supplement > 0 ? "+" : ""}{fmt(salePreview.supplement)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-black/5">
              <span className="text-gray-900 font-semibold">Всього</span>
              <span className="text-brand-600 font-bold tabular-nums">{fmt(salePreview.total)}</span>
            </div>
          </div>
        </div>
      )}

      <Field label="Коментар">
        <Input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Необов'язково"
        />
      </Field>

      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSubmit} disabled={saving} fullWidth size="lg">
        {saving ? "Збереження..." : isEdit ? "Оновити" : "Зберегти"}
      </Button>
    </Modal>
  );
}
