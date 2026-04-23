"use client";

import { useState, useMemo } from "react";
import { useCategories, useServicesCatalog, type Category } from "@/lib/hooks";
import { Button, Input } from "./ui";
import { pluralizeCount } from "@/lib/ua-plural";

/**
 * CategoriesScreen — catalog of service categories.
 *
 * Single source of truth для таксономії послуг. Спеціалізації та
 * Каталог послуг лінкуються сюди по recordId.
 * Архівування, не видалення — історію зберігаємо.
 */
export default function CategoriesScreen({ onBack }: { onBack: () => void }) {
  const { categories, reload, create } = useCategories(true);
  const { services } = useServicesCatalog();

  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Use counts — how many послуг linked to кожна category (для усвідомленого архівування)
  const usageById = useMemo(() => {
    const m = new Map<string, number>();
    services.forEach((s) => {
      if (!s.categoryId) return;
      m.set(s.categoryId, (m.get(s.categoryId) ?? 0) + 1);
    });
    return m;
  }, [services]);

  const active = categories.filter((c) => c.isActive);
  const archived = categories.filter((c) => !c.isActive);

  async function patch(id: string, patch: Partial<Category>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
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
        sortOrder: (active[active.length - 1]?.sortOrder ?? 0) + 1,
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
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Категорії послуг</h2>
      </div>

      <p className="text-[12px] text-gray-500 mb-4 leading-relaxed">
        Категорія об&apos;єднує схожі послуги (Стрижки, Фарбування, Манікюр…). Спеціалізації
        майстрів посилаються сюди — якщо архівувати категорію, вона ховається з пропозицій,
        але існуючі записи зберігають посилання.
      </p>

      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {active.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            usage={usageById.get(c.id) ?? 0}
            editing={editingId === c.id}
            busy={busy}
            onEdit={() => setEditingId(c.id)}
            onCancel={() => setEditingId(null)}
            onSave={async (name) => {
              await patch(c.id, { name });
              setEditingId(null);
            }}
            onArchive={() => patch(c.id, { isActive: false })}
          />
        ))}
      </div>

      <div className="mt-4">
        {!showNew ? (
          <button
            onClick={() => setShowNew(true)}
            className="w-full text-center py-3 border border-dashed border-black/10 rounded-xl text-[13px] text-brand-600 hover:border-brand-500 hover:bg-brand-50/30 cursor-pointer transition-colors"
          >
            + Нова категорія
          </button>
        ) : (
          <div className="border border-black/10 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Назва (напр. Масаж)"
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
                    <div className="text-[11px] text-gray-400">
                      {(() => {
                        const u = usageById.get(c.id) ?? 0;
                        const word = pluralizeCount(u, ["послуга", "послуги", "послуг"]);
                        const verb = pluralizeCount(u, ["посилається", "посилаються", "посилаються"]);
                        return `${u} ${word} ${verb}`;
                      })()}
                    </div>
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

function CategoryRow({
  category,
  usage,
  editing,
  busy,
  onEdit,
  onCancel,
  onSave,
  onArchive,
}: {
  category: Category;
  usage: number;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useMemo(() => {
    setName(category.name);
    setConfirmArchive(false);
  }, [category.id, category.name, editing]);

  if (!editing) {
    return (
      <div
        onClick={onEdit}
        className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-gray-900 truncate">{category.name}</div>
            <div className="text-[11px] text-gray-400">
              {usage > 0 ? `${usage} ${pluralizeCount(usage, ["послуга", "послуги", "послуг"])}` : "без послуг"}
            </div>
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
      {usage > 0 && (
        <div className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
          {usage} {pluralizeCount(usage, ["послуга лінкується", "послуги лінкуються", "послуг лінкується"])} сюди. Архівація приховає категорію з нових виборів,
          але старі послуги збережуть назву.
        </div>
      )}
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
