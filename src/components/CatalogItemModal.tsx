"use client";

import { useState } from "react";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { CatalogProduct, CatalogMaterial } from "@/lib/hooks";

type CatalogType = "products" | "materials";

interface Props {
  type: CatalogType;
  item?: CatalogProduct | CatalogMaterial | null;
  existingGroups: string[];
  onClose: () => void;
  onSaved: () => void;
}

export default function CatalogItemModal({ type, item, existingGroups, onClose, onSaved }: Props) {
  const isEdit = !!item;
  const isMaterial = type === "materials";
  const mat = isMaterial ? (item as CatalogMaterial | undefined) : undefined;

  const [name, setName] = useState(item?.name || "");
  const [article, setArticle] = useState(item?.article || "");
  const [barcode, setBarcode] = useState(item?.barcode || "");
  const [costPrice, setCostPrice] = useState(item?.costPrice?.toString() || "");
  const [salePrice, setSalePrice] = useState(item?.salePrice?.toString() || "");
  const [group, setGroup] = useState(item?.group || "");
  const [totalVolume, setTotalVolume] = useState(mat?.totalVolume?.toString() || "");
  const [unit, setUnit] = useState(mat?.unit || "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Вкажіть назву"); return; }
    setSaving(true);
    setError("");

    try {
      const payload: Record<string, unknown> = { name: name.trim() };
      if (costPrice) payload.costPrice = parseFloat(costPrice);
      if (salePrice) payload.salePrice = parseFloat(salePrice);
      if (group) payload.group = group.trim();
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
          <Input type="number" inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} placeholder="0" className="tabular-nums" />
        </Field>
        <Field label="Ціна продажу">
          <Input type="number" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0" className="tabular-nums" />
        </Field>
      </div>

      {isMaterial && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Фасування">
            <Input type="number" inputMode="decimal" value={totalVolume} onChange={(e) => setTotalVolume(e.target.value)} placeholder="напр. 1000" className="tabular-nums" />
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

      <Field label="Група">
        <Input
          type="text"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          placeholder="Група або категорія"
          list="catalog-groups"
        />
        <datalist id="catalog-groups">
          {existingGroups.map((g) => <option key={g} value={g} />)}
        </datalist>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Артикул">
          <Input type="text" value={article} onChange={(e) => setArticle(e.target.value)} placeholder="Код постачальника" />
        </Field>
        <Field label="Штрих-код">
          <Input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="EAN / UPC" />
        </Field>
      </div>

      {item?.sku && (
        <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          SKU: <span className="font-mono">{item.sku}</span> <span className="text-gray-300">· незмінне</span>
        </div>
      )}

      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <Button onClick={handleSave} disabled={saving} fullWidth size="lg">
        {saving ? "Зберігаю..." : isEdit ? "Зберегти зміни" : "Додати"}
      </Button>
    </Modal>
  );
}
