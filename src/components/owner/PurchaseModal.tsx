"use client";

import { useState } from "react";
import { Button, Field, Input, Modal } from "@/components/ui";
import SingleDatePicker from "@/components/SingleDatePicker";
import PaymentMethodPicker from "@/components/PaymentMethodPicker";
import { todayISO } from "@/lib/format";
import { toast } from "@/components/Toast";
import type { PaymentMethod } from "@/lib/types";

/**
 * Запис виплати постачальнику за товари/матеріали.
 *
 * Намір: швидкий запис без зайвих полів. Постачальник вільним текстом —
 * не вводимо як окрему сутність. Прив'язку до конкретного матеріалу не
 * робимо — постачальники зазвичай приймають змішані замовлення.
 */

/** Існуюча закупка для редагування (підмножина полів Purchase). */
export interface PurchaseEdit {
  id: string;
  date: string;
  amount: number;
  supplier?: string;
  comment?: string;
  paymentType?: PaymentMethod;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  /** Якщо передано — режим редагування існуючої виплати. */
  edit?: PurchaseEdit;
}

export default function PurchaseModal({ onClose, onSaved, edit }: Props) {
  const isEdit = !!edit;
  const [date, setDate] = useState(edit?.date || todayISO());
  const [amount, setAmount] = useState(edit ? String(edit.amount) : "");
  const [supplier, setSupplier] = useState(edit?.supplier || "");
  const [comment, setComment] = useState(edit?.comment || "");
  const [paymentType, setPaymentType] = useState<PaymentMethod>(edit?.paymentType || "готівка");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Вкажіть суму більше 0");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/purchases", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: edit!.id } : {}),
          date,
          amount: amt,
          // У PATCH передаємо рядки завжди (щоб дозволити очистку); у POST — undefined.
          supplier: isEdit ? supplier.trim() : (supplier.trim() || undefined),
          comment: isEdit ? comment.trim() : (comment.trim() || undefined),
          paymentType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не вдалося зберегти");
      }
      toast.success(
        isEdit
          ? `Виплату оновлено: ${amt.toLocaleString("uk-UA")} ₴`
          : `Зафіксовано виплату ${amt.toLocaleString("uk-UA")} ₴`,
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Редагувати виплату" : "Оплата постачальнику"} onClose={onClose}>
      <Field label="Дата">
        <SingleDatePicker value={date} onChange={setDate} />
      </Field>

      <Field label="Сума">
        <Input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="tabular-nums no-spin"
          autoFocus
        />
      </Field>

      <Field label="Каса" hint="з якої видано постачальнику">
        <PaymentMethodPicker value={paymentType} onChange={setPaymentType} />
      </Field>

      <Field label="Постачальник (опц.)">
        <Input
          type="text"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          placeholder="Назва або кому платили"
        />
      </Field>

      <Field label="Коментар (опц.)">
        <Input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="За що, які позиції…"
        />
      </Field>

      <p className="text-[11px] text-gray-400 leading-snug mt-2">
        Виплата НЕ потрапить у звичайні витрати. Вона зменшить Фонд матеріалів —
        собівартість уже врахована у Чистому салону, тож подвійний облік не виникає.
      </p>

      {error && (
        <div className="text-[12px] text-red-500 mt-2">{error}</div>
      )}

      <div className="flex gap-2 mt-4">
        <Button variant="secondary" onClick={onClose} fullWidth disabled={saving}>
          Скасувати
        </Button>
        <Button onClick={handleSave} fullWidth disabled={saving}>
          {saving ? "Зберігаю…" : "Зберегти"}
        </Button>
      </div>
    </Modal>
  );
}
