"use client";

import { useState, useMemo } from "react";
import { useSpecializations, useCategories, type Specialization } from "@/lib/hooks";
import { Button, Input } from "./ui";

/**
 * SpecializationsScreen — tenant-level catalog of roles (Перукарі, Лешмейкер...).
 *
 * Поле categoryIds — масив recordId на таблицю Категорії послуг (FK).
 * Chips беруться з useCategories(true) — single source of truth.
 * Дохлих string-лейблів тепер нема — якщо категорію архівували, чіп
 * лишається selected, але позначається ⚠.
 */
export default function SpecializationsScreen({ onBack }: { onBack: () => void }) {
  const { specializations, reload, create } = useSpecializations(true);
  const { categories: allCategories } = useCategories(true);

  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategoryIds, setNewCategoryIds] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const categoryMap = useMemo(() => {
    const m = new Map<string, { id: string; name: string; isActive: boolean }>();
    allCategories.forEach((c) => m.set(c.id, c));
    return m;
  }, [allCategories]);

  const activeCategoryOptions = useMemo(
    () => allCategories.filter((c) => c.isActive),
    [allCategories],
  );

  const active = specializations.filter((s) => s.isActive);
  const archived = specializations.filter((s) => !s.isActive);

  async function patch(id: string, patch: Partial<Specialization>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/specializations", {
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
        categoryIds: newCategoryIds,
        sortOrder: (active[active.length - 1]?.sortOrder ?? 0) + 1,
      });
      setNewName("");
      setNewCategoryIds([]);
      setShowNew(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка");
    } finally {
      setBusy(false);
    }
  }

  function resolveName(id: string): string {
    return categoryMap.get(id)?.name || "(видалена)";
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
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Спеціалізації</h2>
      </div>

      <p className="text-[12px] text-gray-500 mb-4 leading-relaxed">
        Спеціалізація визначає, які послуги може виконувати майстер. Один майстер може
        мати кілька спеціалізацій. Архівна спеціалізація ховається зі списку, але
        зберігається в картках майстрів для історії.
      </p>

      {error && (
        <div className="text-red-500 text-[13px] bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {active.map((s) => (
          <SpecRow
            key={s.id}
            spec={s}
            editing={editingId === s.id}
            categoryOptions={activeCategoryOptions}
            categoryMap={categoryMap}
            busy={busy}
            onEdit={() => setEditingId(s.id)}
            onCancel={() => setEditingId(null)}
            onSave={async (name, categoryIds) => {
              await patch(s.id, { name, categoryIds });
              setEditingId(null);
            }}
            onArchive={() => patch(s.id, { isActive: false })}
          />
        ))}
      </div>

      {/* Create new */}
      <div className="mt-4">
        {!showNew ? (
          <button
            onClick={() => setShowNew(true)}
            className="w-full text-center py-3 border border-dashed border-black/10 rounded-xl text-[13px] text-brand-600 hover:border-brand-500 hover:bg-brand-50/30 cursor-pointer transition-colors"
          >
            + Нова спеціалізація
          </button>
        ) : (
          <div className="border border-black/10 rounded-xl p-3 space-y-2.5 bg-gray-50/50">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Назва (напр. Бровіст)"
              autoFocus
            />
            {activeCategoryOptions.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Які послуги може виконувати
                </div>
                <CategoryChips
                  options={activeCategoryOptions.map((c) => ({ id: c.id, name: c.name }))}
                  selected={newCategoryIds}
                  categoryMap={categoryMap}
                  onToggle={(id) =>
                    setNewCategoryIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                    )
                  }
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleCreate} disabled={busy || !newName.trim()}>
                {busy ? "Створюю…" : "Додати"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNew(false);
                  setNewName("");
                  setNewCategoryIds([]);
                }}
              >
                Скасувати
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Archived */}
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
              {archived.map((s) => (
                <div
                  key={s.id}
                  className="bg-gray-50 rounded-xl border border-black/[0.04] px-4 py-3 flex items-center justify-between gap-3 opacity-70"
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-gray-500 truncate">{s.name}</div>
                    {s.categoryIds.length > 0 && (
                      <div className="text-[11px] text-gray-400 truncate">
                        {s.categoryIds.map(resolveName).join(" · ")}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => patch(s.id, { isActive: true })}
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

/* ─── Row ─── */

function SpecRow({
  spec,
  editing,
  categoryOptions,
  categoryMap,
  busy,
  onEdit,
  onCancel,
  onSave,
  onArchive,
}: {
  spec: Specialization;
  editing: boolean;
  categoryOptions: { id: string; name: string; isActive: boolean }[];
  categoryMap: Map<string, { id: string; name: string; isActive: boolean }>;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string, categoryIds: string[]) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(spec.name);
  const [categoryIds, setCategoryIds] = useState<string[]>(spec.categoryIds);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useMemo(() => {
    setName(spec.name);
    setCategoryIds(spec.categoryIds);
    setConfirmArchive(false);
  }, [spec.id, spec.name, spec.categoryIds.join("|"), editing]);

  function resolveName(id: string): string {
    return categoryMap.get(id)?.name || "(видалена)";
  }

  if (!editing) {
    return (
      <div
        onClick={onEdit}
        className="bg-white rounded-xl border border-black/[0.06] px-4 py-3 cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-gray-900 truncate">{spec.name}</div>
            <div className="text-[11px] text-gray-400 truncate">
              {spec.categoryIds.length > 0
                ? spec.categoryIds.map(resolveName).join(" · ")
                : "без категорій"}
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
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
          Категорії послуг
        </div>
        <CategoryChips
          options={categoryOptions.map((c) => ({ id: c.id, name: c.name }))}
          selected={categoryIds}
          categoryMap={categoryMap}
          onToggle={(id) =>
            setCategoryIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={() => onSave(name.trim(), categoryIds)} disabled={busy || !name.trim()}>
          Зберегти
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Скасувати
        </Button>
        <div className="ml-auto">
          {!confirmArchive ? (
            <Button
              size="sm"
              variant="danger-ghost"
              onClick={() => setConfirmArchive(true)}
              disabled={busy}
            >
              Архівувати
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-gray-500">Впевнено?</span>
              <Button size="sm" variant="danger" onClick={onArchive} disabled={busy}>
                Так
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
                Ні
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Chips ─── */

function CategoryChips({
  options,
  selected,
  categoryMap,
  onToggle,
}: {
  options: { id: string; name: string }[];
  selected: string[];
  categoryMap: Map<string, { id: string; name: string; isActive: boolean }>;
  onToggle: (id: string) => void;
}) {
  const optionIds = new Set(options.map((o) => o.id));
  // Категорії, що selected, але відсутні серед активних опцій — архівні/видалені.
  const deadIds = selected.filter((id) => !optionIds.has(id));
  const deadOpts = deadIds.map((id) => ({
    id,
    name: categoryMap.get(id)?.name || "(видалена)",
    isActive: categoryMap.get(id)?.isActive ?? false,
  }));
  const allOpts = [...options, ...deadOpts];

  return (
    <div className="flex flex-wrap gap-1.5">
      {allOpts.map((opt) => {
        const on = selected.includes(opt.id);
        const isDead = deadIds.includes(opt.id);
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onToggle(opt.id)}
            title={isDead ? "Категорія архівована в довіднику" : undefined}
            className={`active:scale-[0.97] px-2.5 py-1 rounded-full text-[12px] transition-colors cursor-pointer border ${
              on
                ? isDead
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-black/10 hover:border-brand-500"
            }`}
          >
            {opt.name}
            {isDead && " ⚠"}
          </button>
        );
      })}
    </div>
  );
}
