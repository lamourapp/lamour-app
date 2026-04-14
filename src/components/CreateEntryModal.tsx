"use client";

import { useState, useEffect } from "react";

interface Specialist {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  group: string;
}

type EntryType = "expense" | "debt" | "sale";

const EXPENSE_TYPES = [
  "Прибирання",
  "ЗП Адмін",
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
  const [debtSign, setDebtSign] = useState<"+" | "-">("+"); // + ми винні, - нам винні

  // Fetch products for sale type
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

    // Validate
    if (type === "expense" && !amount) {
      setError("Вкажіть суму");
      return;
    }
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
      } else if (type === "debt") {
        const val = parseFloat(amount);
        body.amount = debtSign === "+" ? Math.abs(val) : -Math.abs(val);
        body.specialistId = specialistId;
      } else if (type === "sale") {
        body.productId = productId;
        body.specialistId = specialistId;
        if (supplement) body.supplement = parseFloat(supplement);
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:w-[420px] sm:rounded-2xl rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[15px] font-semibold text-gray-900">{titles[type]}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Date */}
        <label className="block mb-4">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Дата</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
          />
        </label>

        {/* Specialist (for debt & sale) */}
        {(type === "debt" || type === "sale") && (
          <label className="block mb-4">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Спеціаліст</span>
            <select
              value={specialistId}
              onChange={(e) => setSpecialistId(e.target.value)}
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 bg-white focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="">Оберіть спеціаліста</option>
              {specialists.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        )}

        {/* Amount (for expense & debt) */}
        {(type === "expense" || type === "debt") && (
          <label className="block mb-4">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
              {type === "debt" ? "Сума боргу" : "Сума"}
            </span>
            {type === "debt" && (
              <div className="flex gap-2 mt-1 mb-2">
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
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 tabular-nums"
            />
          </label>
        )}

        {/* Expense type */}
        {type === "expense" && (
          <label className="block mb-4">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Вид витрати</span>
            <select
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value)}
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 bg-white focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="">Без категорії</option>
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
        )}

        {/* Product (for sale) */}
        {type === "sale" && (
          <label className="block mb-4">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Товар</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 bg-white focus:border-brand-500 focus:outline-none cursor-pointer"
            >
              <option value="">Оберіть товар</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.price} ₴
                </option>
              ))}
            </select>
            {selectedProduct && (
              <div className="mt-2 text-[11px] text-gray-400">
                Ціна: {selectedProduct.price} ₴
                {selectedProduct.group && <span> · {selectedProduct.group}</span>}
              </div>
            )}
          </label>
        )}

        {/* Supplement (for sale) */}
        {type === "sale" && (
          <label className="block mb-4">
            <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Доповнення (±)</span>
            <input
              type="number"
              inputMode="numeric"
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="0"
              className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 tabular-nums"
            />
          </label>
        )}

        {/* Comment */}
        <label className="block mb-5">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Коментар</span>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Необов'язково"
            className="mt-1 w-full border border-black/10 rounded-lg px-3 py-2.5 text-[13px] text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20"
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
          className="w-full bg-brand-600 text-white rounded-xl font-medium text-[14px] py-3 cursor-pointer hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Збереження..." : "Зберегти"}
        </button>
      </div>
    </div>
  );
}
