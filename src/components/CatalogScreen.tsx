"use client";

import { useState, useMemo, useCallback } from "react";
import { Button, Segmented, type SegmentedOption } from "./ui";
import { useCatalog, type CatalogProduct, type CatalogMaterial } from "@/lib/hooks";
import { useSettings } from "@/lib/hooks";
import { moneyFormatter } from "@/lib/format";
import CatalogItemModal from "./CatalogItemModal";

type CatalogType = "products" | "materials";

const TABS: SegmentedOption<CatalogType>[] = [
  { id: "products", label: "Товари" },
  { id: "materials", label: "Матеріали" },
];

export default function CatalogScreen({
  initialTab = "products",
  onBack,
}: {
  initialTab?: CatalogType;
  onBack: () => void;
}) {
  const { settings } = useSettings();
  const fmt = moneyFormatter(settings);
  const [tab, setTab] = useState<CatalogType>(initialTab);
  const [query, setQuery] = useState("");
  const [modalItem, setModalItem] = useState<CatalogProduct | CatalogMaterial | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [skuLoading, setSkuLoading] = useState(false);
  const [skuMsg, setSkuMsg] = useState("");

  const products = useCatalog("products");
  const materials = useCatalog("materials");

  const current = tab === "products" ? products : materials;
  const items = current.items as (CatalogProduct | CatalogMaterial)[];

  // Search filter
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.group.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.article?.toLowerCase().includes(q) ||
        i.barcode?.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group by "group" field
  const grouped = useMemo(() => {
    const map = new Map<string, (CatalogProduct | CatalogMaterial)[]>();
    filtered.forEach((i) => {
      const g = i.group || "Без групи";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(i);
    });
    return map;
  }, [filtered]);

  // Unique groups for autocomplete
  const existingGroups = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => { if (i.group) set.add(i.group); });
    return Array.from(set).sort();
  }, [items]);

  function handleCreate() {
    setModalItem(null);
    setShowModal(true);
  }

  function handleEdit(item: CatalogProduct | CatalogMaterial) {
    setModalItem(item);
    setShowModal(true);
  }

  const handleSaved = useCallback(() => {
    products.reload();
    materials.reload();
  }, [products, materials]);

  async function handleExport() {
    window.location.href = `/api/catalog/export?type=${tab}`;
  }

  async function handleEnsureSku() {
    setSkuLoading(true);
    setSkuMsg("");
    try {
      const res = await fetch("/api/catalog/ensure-sku", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSkuMsg(data.message);
      products.reload();
      materials.reload();
    } catch (e) {
      setSkuMsg(e instanceof Error ? e.message : "Помилка");
    } finally {
      setSkuLoading(false);
    }
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
        <h1 className="text-[20px] font-semibold text-gray-900">Каталог</h1>
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <Segmented options={TABS} value={tab} onChange={(t) => { setTab(t); setQuery(""); }} />
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[14px]">
          🔍
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Пошук ${tab === "products" ? "товарів" : "матеріалів"}...`}
          className="w-full h-[42px] border border-black/10 rounded-xl pl-9 pr-3 text-[14px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <Button onClick={handleCreate} fullWidth>
          + {tab === "products" ? "Товар" : "Матеріал"}
        </Button>
        <Button variant="secondary" onClick={handleExport} className="shrink-0 !px-3" title="Експорт CSV">
          📥
        </Button>
      </div>

      {/* Loading / error */}
      {current.loading && (
        <div className="text-center text-gray-400 py-8 text-[14px]">Завантаження...</div>
      )}
      {current.error && (
        <div className="text-center text-red-500 py-8 text-[14px]">{current.error}</div>
      )}

      {/* Items list */}
      {!current.loading && filtered.length === 0 && (
        <div className="text-center text-gray-400 py-8 text-[14px]">
          {query ? "Нічого не знайдено" : "Поки порожньо"}
        </div>
      )}

      {!current.loading && filtered.length > 0 && (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([group, groupItems]) => (
            <div key={group}>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 px-1">
                {group} · {groupItems.length}
              </div>
              <div className="bg-white rounded-xl border border-black/5 divide-y divide-black/5">
                {groupItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleEdit(item)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-brand-50/50 cursor-pointer transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] text-gray-900 truncate">{item.name}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5 flex gap-2">
                        {item.sku && <span className="font-mono">{item.sku}</span>}
                        {item.article && <span>{item.article}</span>}
                        {tab === "materials" && (item as CatalogMaterial).totalVolume > 0 && (
                          <span>
                            {(item as CatalogMaterial).totalVolume}
                            {(item as CatalogMaterial).unit || ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[14px] font-medium text-gray-900 tabular-nums">
                        {fmt(item.salePrice)}
                      </div>
                      {item.costPrice > 0 && (
                        <div className="text-[11px] text-gray-400 tabular-nums">
                          зак. {fmt(item.costPrice)}
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
      {!current.loading && items.length > 0 && (
        <div className="mt-6 text-center text-[12px] text-gray-400">
          {items.length} {tab === "products" ? "товарів" : "матеріалів"}
          {filtered.length !== items.length && ` · показано ${filtered.length}`}
        </div>
      )}

      {/* Ensure SKU button — only show if there are items without SKU */}
      {!current.loading && items.some((i) => !i.sku) && (
        <div className="mt-4 text-center">
          <Button variant="ghost" onClick={handleEnsureSku} disabled={skuLoading}>
            {skuLoading ? "Присвоюю..." : "Присвоїти SKU"}
          </Button>
        </div>
      )}
      {skuMsg && (
        <div className="mt-2 text-center text-[12px] text-brand-600">{skuMsg}</div>
      )}

      {/* Modal */}
      {showModal && (
        <CatalogItemModal
          type={tab}
          item={modalItem}
          existingGroups={existingGroups}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
