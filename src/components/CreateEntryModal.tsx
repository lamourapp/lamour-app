"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Button, Field, Input, Modal, Select, inputCls } from "./ui";
import { useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";

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

const EXPENSE_TYPES = [
  "ЗП Адмін",
  "Прибирання",
  "Вода",
  "Газ",
  "Електрика",
  "ФОП",
  "Податки",
  "Побутова хімія",
  "Чай, вершки, миючий засіб",
  "СМС сповіщення",
  "Найманий працівник (податок)",
  "QR",
  "Інше",
];

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
export default function CreateEntryModal({
  type,
  specialists,
  onClose,
  onCreated,
}: {
  type: EntryType;
  specialists: Specialist[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [specialistId, setSpecialistId] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [comment, setComment] = useState("");
  const [productId, setProductId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [supplement, setSupplement] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [debtSign, setDebtSign] = useState<"+" | "-">("+");

  useEffect(() => {
    if (type === "sale") {
      fetch("/api/products")
        .then((r) => r.json())
        .then((data) => setProducts(data))
        .catch(() => {});
    }
  }, [type]);

  const selectedProduct = products.find((p) => p.id === productId);

  async function handleSubmit() {
    setError("");

    if (type === "expense" && !amount) { setError("Вкажіть суму"); return; }
    if (type === "debt") {
      if (!amount) { setError("Вкажіть суму"); return; }
      if (!specialistId) { setError("Оберіть спеціаліста"); return; }
    }
    if (type === "sale") {
      if (!productId) { setError("Оберіть товар"); return; }
      if (!specialistId) { setError("Оберіть спеціаліста"); return; }
    }

    setSaving(true);
    try {
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
        body.productId = productId;
        body.specialistId = specialistId;
        if (supplement) body.supplement = parseFloat(supplement);
        if (selectedProduct) {
          body.salePrice = selectedProduct.price;
          body.costPrice = selectedProduct.costPrice;
        }
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

  const titles: Record<EntryType, string> = {
    expense: "Нова витрата",
    debt: "Новий борг",
    sale: "Новий продаж",
  };

  return (
    <Modal title={titles[type]} onClose={onClose}>
      <Field label="Дата">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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

      {(type === "expense" || type === "debt") && (
        <Field label={type === "debt" ? "Сума боргу" : "Сума"}>
          {type === "debt" && (
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setDebtSign("+")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  debtSign === "+" ? "bg-red-50 text-red-600 border border-red-200" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                + ми винні
              </button>
              <button
                type="button"
                onClick={() => setDebtSign("-")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  debtSign === "-" ? "bg-green-50 text-green-600 border border-green-200" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                − нам винні
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

      {type === "expense" && (
        <Field label="Вид витрати">
          <Select value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
            <option value="">Без категорії</option>
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "sale" && (
        <Field label="Товар">
          <ProductPicker products={products} productId={productId} onSelect={setProductId} />
          {selectedProduct && (
            <div className="mt-2 text-[12px] text-gray-400">
              Ціна: {fmt(selectedProduct.price)}
              {selectedProduct.group && <span> · {selectedProduct.group}</span>}
            </div>
          )}
        </Field>
      )}

      {type === "sale" && (
        <Field label="Доповнення (±)">
          <Input
            type="number"
            inputMode="numeric"
            value={supplement}
            onChange={(e) => setSupplement(e.target.value)}
            placeholder="0"
            className="tabular-nums"
          />
        </Field>
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
        {saving ? "Збереження..." : "Зберегти"}
      </Button>
    </Modal>
  );
}
