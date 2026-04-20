"use client";

import { useState, useMemo } from "react";
import { useSpecializations, useServicesCatalog, type Specialization } from "@/lib/hooks";
import { Button, Input } from "./ui";

/**
 * SpecializationsScreen — tenant-level catalog of roles (Перукарі, Лешмейкер...).
 *
 * Behaviour:
 * - Rename: inline, PATCH `name`.
 * - Change categories: toggle chips, PATCH `categories`. Categories are sourced
 *   from the union of (a) categories already on any spec and (b) active service
 *   categories in /api/services-catalog, so the dropdown never lists dead strings.
 * - Archive: soft delete via `isActive=false`. Specialists keep their link and
 *   see the chip in their card (rendered greyed out elsewhere). Archived specs
 *   are hidden by default, shown with a toggle.
 * - Create: inline form at the bottom.
 *
 * Never hard-deletes — preserves data integrity for historical linked records.
 */
export default function SpecializationsScreen({ onBack }: { onBack: () => void }) {
  const { specializations, reload, create } = useSpecializations(true); // include archived
  const { categories: serviceCategories } = useServicesCatalog();

  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    specializations.forEach((s) => s.categories.forEach((c) => set.add(c)));
    serviceCategories.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [specializations, serviceCategories]);

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
        categories: newCategories,
        sortOrder: (active[active.length - 1]?.sortOrder ?? 0) + 1,
      });
      setNewName("");
      setNewCategories([]);
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
            categoryOptions={categoryOptions}
            busy={busy}
            onEdit={() => setEditingId(s.id)}
            onCancel={() => setEditingId(null)}
            onSave={async (name, categories) => {
              await patch(s.id, { name, categories });
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
            {categoryOptions.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Які послуги може виконувати
                </div>
                <CategoryChips
                  options={categoryOptions}
                  selected={newCategories}
                  onToggle={(cat) =>
                    setNewCategories((prev) =>
                      prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat],
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
                  setNewCategories([]);
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
                    {s.categories.length > 0 && (
                      <div className="text-[11px] text-gray-400 truncate">
                        {s.categories.join(" · ")}
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
  busy,
  onEdit,
  onCancel,
  onSave,
  onArchive,
}: {
  spec: Specialization;
  editing: boolean;
  categoryOptions: string[];
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string, categories: string[]) => void;
  onArchive: () => void;
}) {
  const [name, setName] = useState(spec.name);
  const [categories, setCategories] = useState<string[]>(spec.categories);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Reset local state when the spec or edit mode changes
  useMemo(() => {
    setName(spec.name);
    setCategories(spec.categories);
    setConfirmArchive(false);
  }, [spec.id, spec.name, spec.categories.join("|"), editing]);

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
              {spec.categories.length > 0 ? spec.categories.join(" · ") : "без категорій"}
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
          options={categoryOptions}
          selected={categories}
          onToggle={(cat) =>
            setCategories((prev) =>
              prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat],
            )
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button size="sm" onClick={() => onSave(name.trim(), categories)} disabled={busy || !name.trim()}>
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
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (cat: string) => void;
}) {
  // "Dead" categories — selected but not in current options (e.g. renamed in services catalog).
  const dead = selected.filter((c) => !options.includes(c));
  const allOpts = [...options, ...dead];

  return (
    <div className="flex flex-wrap gap-1.5">
      {allOpts.map((cat) => {
        const on = selected.includes(cat);
        const isDead = dead.includes(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            title={isDead ? "Категорії більше нема у каталозі послуг" : undefined}
            className={`px-2.5 py-1 rounded-full text-[12px] transition-colors cursor-pointer border ${
              on
                ? isDead
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-brand-600 text-white border-brand-600"
                : "bg-white text-gray-600 border-black/10 hover:border-brand-500"
            }`}
          >
            {cat}
            {isDead && " ⚠"}
          </button>
        );
      })}
    </div>
  );
}
