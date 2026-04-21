"use client";

import { useState, useMemo } from "react";
import { useExpenseTypes, type ExpenseType } from "@/lib/hooks";
import { Button, Input } from "./ui";

/**
 * ExpenseTypesScreen — довідник видів витрат.
 *
 * Паттерн дзеркалить CategoriesScreen: архівування (isActive=false) замість
 * видалення, inline-редагування, нижня секція з архівом. На відміну від
 * категорій, тут немає usage-лічильника — журнальне поле «Вид витрати» в
 * Airtable є singleSelect (текстовий вибір), без FK-лінку. Якщо вид
 * деактивовано, історичні записи продовжать відображати його текстом, просто
 * він зникне з випадаючого списку при створенні нової витрати.
 */
export default function ExpenseTypesScreen({ onBack }: { onBack: () => void }) {
  const { expenseTypes, reload, create, update } = useExpenseTypes(true);

  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(() => expenseTypes.filter((c) => c.isActive), [expenseTypes]);
  const archived = useMemo(() => expenseTypes.filter((c) => !c.isActive), [expenseTypes]);

  async function patch(id: string, patch: Partial<Omit<ExpenseType, "id">>) {
    setBusy(true);
    setError("");
    try {
      await update(id, patch);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await create({
        name: newName.trim(),
        sortOrder: (active[active.length - 1]?.sortOrder ?? 0) + 10,
      });
      setNewName("");
      setShowNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-gray-700 cursor-pointer transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Види витрат</h2>
      </div>

      <p className="text-[12px] text-gray-500 mb-4 leading-relaxed">
        Види витрат (ЗП адмін, прибирання, комуналка, податки…) з&apos;являться у випадаючому
        списку при створенні витрати в журналі. Архівування ховає вид із нових виборів, але
        історичні записи зберігають назву.
      </p>

      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {active.map((c) => (
          <ExpenseTypeRow
            key={c.id}
            item={c}
            editing={editingId === c.id}
            busy={busy}
            onEdit={() => setEditingId(c.id)}
            onCancel={() => setEditingId(null)}
            onSave={async (name) => {
              await patch(c.id, { name });
              setEditingId(null);
            }}
            onArchive={async () => {
              await patch(c.id, { isActive: false });
              setEditingId(null);
              // Розгортаємо архів щоб користувач побачив куди поділось — інакше
              // рядок просто зникає з активного списку і виглядає як «нічого не сталось».
              setShowArchived(true);
            }}
          />
        ))}
      </div>

      <div className="mt-4">
        {!showNew ? (
          <button
            onClick={() => setShowNew(true)}
            className="w-full text-center py-3 border border-dashed border-black/10 rounded-xl text-[13px] text-brand-600 hover:border-brand-500 hover:bg-brand-50/30 cursor-pointer transition-colors"
          >
            + Новий вид витрати
          </button>
        ) : (
          <div className="border border-black/10 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Назва (напр. Реклама)"
              autoFocus
            />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={busy || !newName.trim()}>
                {busy ? "Створюю…" : "Додати"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setShowNew(false); setNewName(""); }}
              >
                Скасувати
              </Button>
            </div>
          </div>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          >
            {showArchived ? "Сховати архівні" : `Показати архівні (${archived.length})`}
          </button>
          {showArchived && (
            <div className="space-y-2 mt-3">
              {archived.map((c) => (
                <div
                  key={c.id}
                  className="bg-gray-50 rounded-xl border border-black/[0.04] px-4 py-3 flex items-center justify-between gap-3 opacity-70"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gray-500 truncate">{c.name}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => patch(c.id, { isActive: true })}
                  >
                    Відновити
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpenseTypeRow({
  item,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onArchive,
}: {
  item: ExpenseType;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useMemo(() => {
    setName(item.name);
    setConfirmArchive(false);
  }, [item.id, item.name, editing]);

  if (!editing) {
    return (
      <div
        onClick={onEdit}
        className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-gray-900 truncate">{item.name}</div>
          </div>
          <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-brand-500 px-4 py-3 space-y-3">
      <Input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Назва"
        autoFocus
      />
      <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
        Перейменування не зачепить старі записи — вони зберігають стару назву як текст.
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={() => onSave(name.trim())} disabled={busy || !name.trim()}>
          Зберегти
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Скасувати
        </Button>
        <div className="ml-auto">
          {!confirmArchive ? (
            <Button size="sm" variant="danger-ghost" onClick={() => setConfirmArchive(true)} disabled={busy}>
              Архівувати
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-500">Впевнено?</span>
              <Button size="sm" variant="danger" onClick={onArchive} disabled={busy}>Так</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>Ні</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
