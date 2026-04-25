"use client";

import { useState, useCallback } from "react";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { CatalogProduct, CatalogMaterial } from "@/lib/hooks";
import BarcodeScanner from "./BarcodeScanner";
import { toast } from "./Toast";

type CatalogType = "products" | "materials";

interface Props {
  type: CatalogType;
  item?: CatalogProduct | CatalogMaterial | null;
  existingGroups?: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function CatalogItemModal({ type, item, onClose, onSaved }: Props) {
  const isEdit = !!item;
  const isMaterial = type === "materials";
  const mat = isMaterial ? (item as CatalogMaterial | undefined) : undefined;

  const [name, setName] = useState(item?.name || "");
  const [article, setArticle] = useState(item?.article || "");
  const [barcode, setBarcode] = useState(item?.barcode || "");
  const [costPrice, setCostPrice] = useState(item?.costPrice?.toString() || "");
  const [salePrice, setSalePrice] = useState(item?.salePrice?.toString() || "");
  const [totalVolume, setTotalVolume] = useState(mat?.totalVolume?.toString() || "");
  const [unit, setUnit] = useState(mat?.unit || "");
  // «% спеціалісту за продаж» більше не живе на товарі — керується на
  // співробітнику (див. StaffScreen / Спеціаліст.«% за продаж»). Коли один
  // майстер продає той самий товар, а інший ні — це про майстра, не про
  // товар. Тому поле тут прибране.
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  // Single-scan для форми створення товару: перший успішний код заповнює
  // поле «штрих-код» і закриває сканер. Multi-scan тут немає сенсу — у нас
  // одне поле для одного коду.
  const handleScan = useCallback((code: string) => {
    setBarcode(code);
    setScannerOpen(false);
    toast.success(`Код: ${code}`);
  }, []);

  async function handleSave() {
    if (!name.trim()) { setError("Вкажіть назву"); return; }
    setSaving(true);
    setError("");

    try {
      const payload: Record<string, unknown> = { name: name.trim(), isActive };
      if (costPrice) payload.costPrice = parseFloat(costPrice);
      if (salePrice) payload.salePrice = parseFloat(salePrice);
      if (article) payload.article = article.trim();
      if (barcode) payload.barcode = barcode.trim();

      if (isMaterial) {
        if (totalVolume) payload.totalVolume = parseFloat(totalVolume);
        if (unit) payload.unit = unit;
      }

      const url = `/api/${type}`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: item!.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  const title = isEdit
    ? isMaterial ? "Редагувати матеріал" : "Редагувати товар"
    : isMaterial ? "Новий матеріал" : "Новий товар";

  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Назва">
        <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва товару/матеріалу" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ціна закупки">
          <Input type="number" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" className="tabular-nums no-spin" />
        </Field>
        <Field label="Ціна продажу">
          <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0" className="tabular-nums no-spin" />
        </Field>
      </div>

      {isMaterial && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Фасування">
            <Input type="number" inputMode="decimal" value={totalVolume} onChange={(e) => setTotalVolume(e.target.value)} placeholder="напр. 1000" className="tabular-nums no-spin" />
          </Field>
          <Field label="Одиниця">
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">—</option>
              <option value="мл">мл</option>
              <option value="г">г</option>
              <option value="шт">шт</option>
            </Select>
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Артикул">
          <Input type="text" value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Код постачальника" />
        </Field>
        <Field label="Штрих-код">
          <div className="flex gap-2">
            <Input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="EAN / UPC"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label="Сканувати штрих-код"
              className="shrink-0 w-11 h-11 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center text-[18px] active:scale-95 active:bg-brand-100 transition-all cursor-pointer"
            >
              📷
            </button>
          </div>
        </Field>
      </div>

      {item?.sku && (
        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          SKU: <span className="font-mono">{item.sku}</span> <span className="text-gray-300">· незмінне</span>
        </div>
      )}

      {/* Active / inactive toggle */}
      {isEdit && (
        <label className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl cursor-pointer select-none">
          <div className="relative">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-brand-500 transition-colors" />
            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm peer-checked:translate-x-4 transition-transform" />
          </div>
          <div>
            <div className="text-[13px] text-gray-900 font-medium">
              {isActive ? "Активний" : "Виведений з асортименту"}
            </div>
            <div className="text-[11px] text-gray-400">
              {isActive
                ? "Показується у вибірках і каталозі"
                : "Не пропонується при створенні записів"}
            </div>
          </div>
        </label>
      )}

      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} fullWidth size="lg">
        {saving ? "Зберігаю…" : isEdit ? "Зберегти зміни" : "Додати"}
      </Button>

      {scannerOpen && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </Modal>
  );
}
