"use client";

import { useState, useMemo, useRef } from "react";
import { Button } from "./ui";
import { useServicesCatalog, type ServiceCatalogItem } from "@/lib/hooks";
import { useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";
import ServiceItemModal from "./ServiceItemModal";

export default function ServicesCatalogScreen({ onBack }: { onBack: () => void }) {
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  const { services, categories, loading, error, reload } = useServicesCatalog();

  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [modalItem, setModalItem] = useState<ServiceCatalogItem | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inactiveCount = useMemo(() => services.filter((s) => !s.isActive).length, [services]);

  const filtered = useMemo(() => {
    let list = showInactive ? services : services.filter((s) => s.isActive);

    if (selectedCategory) {
      list = list.filter((s) => s.category === selectedCategory);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [services, query, selectedCategory, showInactive]);

  // Group filtered items by category
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceCatalogItem[]>();
    for (const item of filtered) {
      const cat = item.category || "Без групи";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [filtered]);

  function handleCreate() {
    setModalItem(null);
    setShowModal(true);
  }

  function handleEdit(item: ServiceCatalogItem) {
    setModalItem(item);
    setShowModal(true);
  }

  function formatDuration(min: number): string {
    if (!min) return "";
    if (min < 60) return `${min} хв`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? `${h} год ${m} хв` : `${h} год`;
  }

  return (
    <div className="max-w-[600px] mx-auto px-4 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 cursor-pointer transition-colors"
          aria-label="Назад"
        >
          ←
        </button>
        <h1 className="text-[20px] font-semibold text-gray-900">Каталог послуг</h1>
      </div>

      {/* Category filter pills */}
      {categories.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-all ${
              !selectedCategory
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Всі ({services.filter((s) => showInactive || s.isActive).length})
          </button>
          {categories.map((cat) => {
            const count = services.filter((s) => s.category === cat && (showInactive || s.isActive)).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium cursor-pointer transition-all ${
                  selectedCategory === cat
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[14px]">
          🔍
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук послуг..."
          className="w-full h-[42px] border border-black/10 rounded-xl pl-9 pr-3 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
        />
      </div>

      {/* Action button */}
      <div className="flex gap-2 mb-4">
        <Button onClick={handleCreate} fullWidth>
          + Послуга
        </Button>
      </div>

      {/* Show inactive toggle */}
      {inactiveCount > 0 && (
        <button
          onClick={() => setShowInactive((v) => !v)}
          className="mb-3 text-[12px] text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          {showInactive ? "Сховати неактивні" : `Показати неактивні (${inactiveCount})`}
        </button>
      )}

      {/* Loading / error */}
      {loading && (
        <div className="text-center text-gray-400 py-8 text-[14px]">Завантаження...</div>
      )}
      {error && (
        <div className="text-center text-red-500 py-8 text-[14px]">{error}</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="text-center text-gray-400 py-8 text-[14px]">
          {query || selectedCategory ? "Нічого не знайдено" : "Поки порожньо"}
        </div>
      )}

      {/* Services grouped by category */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([cat, items]) => (
            <div key={cat}>
              {/* Show group header unless filtering by specific category */}
              {!selectedCategory && (
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-2">
                  <span>{cat}</span>
                  <span className="text-gray-300">· {items.length}</span>
                </div>
              )}
              <div className="bg-white rounded-xl border border-black/5 divide-y divide-black/5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleEdit(item)}
                    className={`w-full text-left px-3.5 py-2.5 hover:bg-brand-50/50 cursor-pointer transition-colors flex items-center justify-between gap-2 ${!item.isActive ? "opacity-50" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-gray-900 truncate">
                        {item.name}
                        {!item.isActive && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">⏸</span>}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5 flex gap-2">
                        {item.hours > 0 && (
                          <span>{item.hours} год × {fmt(item.hourlyRate)}</span>
                        )}
                        {item.materialsCost > 0 && (
                          <span>+ мат. {fmt(item.materialsCost)}</span>
                        )}
                        {item.duration > 0 && (
                          <span className="text-gray-300">· {formatDuration(item.duration)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-medium text-gray-900 tabular-nums">
                        {fmt(item.totalPrice)}
                      </div>
                      {item.hours > 0 && (
                        <div className="text-[11px] text-gray-400 tabular-nums">
                          роб. {fmt(item.workPrice * item.hours)}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer stats */}
      {!loading && services.length > 0 && (
        <div className="mt-6 text-center text-[12px] text-gray-400">
          {services.filter((s) => s.isActive).length} послуг
          {filtered.length !== services.filter((s) => showInactive || s.isActive).length && ` · показано ${filtered.length}`}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ServiceItemModal
          item={modalItem}
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
