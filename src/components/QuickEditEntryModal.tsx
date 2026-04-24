"use client";

import { useState, useMemo } from "react";
import { Button, Field, Input, Modal } from "./ui";
import { useExpenseTypes } from "@/lib/hooks";
import type { JournalEntry, PaymentMethod } from "@/lib/types";
import SingleDatePicker from "./SingleDatePicker";
import SearchableSelect from "./SearchableSelect";
import PaymentMethodPicker from "./PaymentMethodPicker";

interface Specialist {
  id: string;
  name: string;
}

/**
 * QuickEditEntryModal — легкий редактор «метаданих» будь-якого запису журналу.
 *
 * Scope: дата / спеціаліст / коментар + простий числовий параметр, який
 * безпечно міняти без переобрахунку калькуляції:
 *   - expense: сума, вид витрати
 *   - debt:    сума зі знаком (+ ми винні / − нам винні)
 *   - sale:    доповнення до продажу
 *   - service/rental: доповнення до послуги
 *
 * Для зміни складу продажу / калькуляції послуги — delete+recreate. Це свідомо:
 * формули 2-3 роки живуть, переобрахунок з PATCH-у занадто ризиковано для MVP.
 */
export default function QuickEditEntryModal({
  entry,
  specialists,
  onClose,
  onSaved,
}: {
  entry: JournalEntry;
  specialists: Specialist[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { expenseTypes } = useExpenseTypes(false);

  const [date, setDate] = useState(entry.date);
  const [specialistId, setSpecialistId] = useState(entry.specialistId || "");
  const [comment, setComment] = useState(entry.comment || "");

  // Per-type fields ─────────────────────────────────────────
  const [amount, setAmount] = useState(() => {
    if (entry.type === "expense") return String(Math.abs(entry.amount));
    if (entry.type === "debt") return String(Math.abs(entry.amount));
    return "";
  });
  const [debtSign, setDebtSign] = useState<"+" | "-">(() =>
    entry.type === "debt" && entry.amount < 0 ? "-" : "+",
  );
  const [expenseType, setExpenseType] = useState(entry.expenseType || "");
  const [supplement, setSupplement] = useState(() => {
    const s = entry.supplement;
    if (s === undefined || s === null) return "";
    return String(Math.abs(s));
  });
  const [supplementSign, setSupplementSign] = useState<"+" | "-">(() =>
    (entry.supplement ?? 0) < 0 ? "-" : "+",
  );
  // Для боргу каса не релевантна (це не рух коштів, а облік).
  const showsPayment = entry.type !== "debt";
  const [paymentType, setPaymentType] = useState<PaymentMethod | undefined>(
    entry.paymentType,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title = useMemo(() => {
    const labels: Record<JournalEntry["type"], string> = {
      expense: "Редагувати витрату",
      debt: "Редагувати борг",
      sale: "Редагувати продаж",
      service: "Редагувати послугу",
      rental: "Редагувати оренду",
    };
    return labels[entry.type];
  }, [entry.type]);

  const showsSupplement = entry.type === "sale" || entry.type === "service" || entry.type === "rental";
  const showsAmount = entry.type === "expense" || entry.type === "debt";

  async function handleSave() {
    setError("");

    const body: Record<string, unknown> = {
      id: entry.id,
      kind: entry.type,
      date,
      specialistId: specialistId || "",
      comment,
    };

    if (entry.type === "expense") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) { setError("Вкажіть додатну суму"); return; }
      body.amount = n;
      body.expenseType = expenseType;
    } else if (entry.type === "debt") {
      const n = Number(amount);
      if (!Number.isFinite(n) || n <= 0) { setError("Вкажіть додатну суму"); return; }
      body.amount = debtSign === "-" ? -n : n;
    } else if (showsSupplement) {
      const n = Number(supplement);
      const signed = !Number.isFinite(n) || n === 0 ? 0 : (supplementSign === "-" ? -Math.abs(n) : Math.abs(n));
      body.supplement = signed;
    }

    if (showsPayment && paymentType) {
      body.paymentType = paymentType;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/journal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {entry.title && (
        <div className="text-[12px] text-gray-500 -mt-2 mb-3 truncate">{entry.title}</div>
      )}
      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</div>
      )}

      <div className="space-y-3">
        <Field label="Дата">
          <SingleDatePicker value={date} onChange={setDate} />
        </Field>

        <Field label="Спеціаліст" hint={entry.type === "expense" ? "(опціонально, для ЗП)" : undefined}>
          <SearchableSelect
            items={specialists}
            selectedId={specialistId}
            onSelect={setSpecialistId}
            placeholder="Не прив'язано"
            title="Спеціаліст"
            renderItem={(s) => <span className="text-[14px] text-gray-900 truncate">{s.name}</span>}
            renderSelected={(s) => <span className="text-[14px] text-gray-900 font-medium">{s.name}</span>}
          />
        </Field>

        {entry.type === "expense" && (
          <Field label="Вид витрати">
            {(() => {
              const items = expenseType && !expenseTypes.some((t) => t.name === expenseType)
                ? [...expenseTypes, { id: `__archived__${expenseType}`, name: `${expenseType} (архів)` }]
                : expenseTypes;
              const selId = expenseType
                ? (expenseTypes.find((t) => t.name === expenseType)?.id || `__archived__${expenseType}`)
                : "";
              return (
                <SearchableSelect
                  items={items}
                  selectedId={selId}
                  onSelect={(id) => {
                    if (!id) { setExpenseType(""); return; }
                    const found = items.find((t) => t.id === id);
                    setExpenseType(found ? found.name.replace(/ \(архів\)$/, "") : "");
                  }}
                  placeholder="Без категорії"
                  title="Вид витрати"
                  renderItem={(t) => <span className="text-[14px] text-gray-900 truncate">{t.name}</span>}
                  renderSelected={(t) => <span className="text-[14px] text-gray-900 font-medium">{t.name}</span>}
                />
              );
            })()}
          </Field>
        )}

        {showsAmount && (
          <Field label={entry.type === "debt" ? "Сума боргу" : "Сума"}>
            {entry.type === "debt" && (
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
                    debtSign === "-" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-gray-50 text-gray-500 border border-black/5"
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
            />
          </Field>
        )}

        {showsSupplement && (
          <Field label="Доповнення" hint="(± до суми, напр. чайові або знижка)">
            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setSupplementSign("+")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  supplementSign === "+" ? "bg-brand-50 text-brand-600 border border-brand-200" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                + додати
              </button>
              <button
                type="button"
                onClick={() => setSupplementSign("-")}
                className={`flex-1 py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                  supplementSign === "-" ? "bg-gray-200 text-gray-700 border border-gray-300" : "bg-gray-50 text-gray-500 border border-black/5"
                }`}
              >
                − зняти
              </button>
            </div>
            <Input
              type="number"
              inputMode="decimal"
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="0"
            />
          </Field>
        )}

        {showsPayment && (
          <Field label="Каса" hint={entry.type === "expense" ? "з якої видано" : "куди прийнято"}>
            <PaymentMethodPicker value={paymentType} onChange={setPaymentType} />
          </Field>
        )}

        <Field label="Коментар" hint="(опціонально)">
          <Input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Нотатка"
          />
        </Field>

        {entry.type === "sale" && (
          <div className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">
            Щоб змінити склад або кількість товарів — скасуйте запис і створіть заново.
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-5">
        <Button variant="ghost" onClick={onClose} disabled={saving}>Скасувати</Button>
        <Button onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? "Зберігаю…" : "Оновити"}
        </Button>
      </div>
    </Modal>
  );
}
