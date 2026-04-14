"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { Settings } from "@/app/api/settings/route";

/* ─── Business-type presets ─── */

const businessPresets: Record<
  Settings["businessType"],
  { label: string; desc: string; specialist: string; location: string }
> = {
  beauty: { label: "Салон краси", desc: "Майстер · Салон", specialist: "Майстер", location: "Салон" },
  barber: { label: "Барбершоп", desc: "Барбер · Барбершоп", specialist: "Барбер", location: "Барбершоп" },
  cosmetology: { label: "Косметологія", desc: "Косметолог · Клініка", specialist: "Косметолог", location: "Клініка" },
  auto: { label: "Автосервіс", desc: "Механік · Сервіс", specialist: "Механік", location: "Сервіс" },
  dental: { label: "Стоматологія", desc: "Лікар · Клініка", specialist: "Лікар", location: "Клініка" },
  custom: { label: "Інше", desc: "Свої назви", specialist: "", location: "" },
};

/* ─── Accent color presets ─── */

const accentColors: { color: string; title: string }[] = [
  { color: "#9333ea", title: "Фіолетовий" },
  { color: "#e11d48", title: "Рожевий" },
  { color: "#0891b2", title: "Бірюзовий" },
  { color: "#059669", title: "Зелений" },
  { color: "#d97706", title: "Бурштиновий" },
  { color: "#dc2626", title: "Червоний" },
  { color: "#2563eb", title: "Синій" },
  { color: "#4f46e5", title: "Індіго" },
  { color: "#171717", title: "Чорний" },
];

/* ─── Modal: "Параметри бізнесу" ─── */

function BusinessSettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const [draft, setDraft] = useState<Settings | null>(settings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Keep local draft in sync when store hydrates.
  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  if (!draft) {
    return (
      <Modal title="Параметри бізнесу" onClose={onClose}>
        <div className="py-6 text-center text-gray-400 text-[13px]">Завантаження…</div>
      </Modal>
    );
  }

  function patch(p: Partial<Settings>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  function selectPreset(key: Settings["businessType"]) {
    const preset = businessPresets[key];
    setDraft((d) =>
      d
        ? {
            ...d,
            businessType: key,
            specialistTerm: preset.specialist || d.specialistTerm,
            locationTerm: preset.location || d.locationTerm,
          }
        : d,
    );
  }

  async function save() {
    const d = draft;
    if (!d) return;
    if (!d.name.trim()) {
      setError("Вкажіть назву");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await update({
        name: d.name.trim(),
        currency: d.currency,
        businessType: d.businessType,
        specialistTerm: d.specialistTerm.trim(),
        locationTerm: d.locationTerm.trim(),
        brandColor: d.brandColor,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка збереження");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Параметри бізнесу" onClose={onClose} width="lg">
      <Field label="Назва">
        <Input
          type="text"
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value })}
        />
      </Field>

      <Field label="Валюта">
        <Select
          value={draft.currency}
          onChange={(e) => patch({ currency: e.target.value as Settings["currency"] })}
        >
          <option value="UAH">₴ — гривня (UAH)</option>
          <option value="USD">$ — долар (USD)</option>
          <option value="EUR">€ — євро (EUR)</option>
          <option value="PLN">zł — злотий (PLN)</option>
        </Select>
      </Field>

      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Тип бізнесу
        </div>
        <p className="text-[11px] text-gray-400 mb-2.5">
          Визначає термінологію інтерфейсу — можна змінити будь-коли
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.entries(businessPresets) as [Settings["businessType"], typeof businessPresets["beauty"]][]).map(
            ([key, preset]) => (
              <button
                key={key}
                type="button"
                onClick={() => selectPreset(key)}
                className={`text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all
                  ${
                    draft.businessType === key
                      ? "border-brand-500 bg-brand-50/50"
                      : "border-transparent bg-gray-50 hover:border-gray-200"
                  }`}
              >
                <div className="text-[12px] font-semibold text-gray-900">{preset.label}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{preset.desc}</div>
              </button>
            ),
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl">
          <Field label="Спеціаліст">
            <Input
              type="text"
              value={draft.specialistTerm}
              onChange={(e) => patch({ specialistTerm: e.target.value })}
            />
          </Field>
          <Field label="Локація">
            <Input
              type="text"
              value={draft.locationTerm}
              onChange={(e) => patch({ locationTerm: e.target.value })}
            />
          </Field>
        </div>
      </div>

      <div className="h-px bg-black/5" />

      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
          Акцентний колір
        </div>
        <p className="text-[11px] text-gray-400 mb-2.5">
          Збережеться для всіх пристроїв. Візуальне оновлення підключимо на наступному кроці.
        </p>
        <div className="flex gap-2 flex-wrap">
          {accentColors.map((c) => (
            <button
              key={c.color}
              type="button"
              title={c.title}
              onClick={() => patch({ brandColor: c.color })}
              className="w-10 h-10 rounded-xl cursor-pointer transition-all hover:scale-105"
              style={{
                backgroundColor: c.color,
                boxShadow:
                  draft.brandColor.toLowerCase() === c.color.toLowerCase()
                    ? `0 0 0 2px white, 0 0 0 4px ${c.color}`
                    : "none",
              }}
            />
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <label className="text-[11px] text-gray-400">або HEX:</label>
          <input
            type="text"
            value={draft.brandColor}
            onChange={(e) => patch({ brandColor: e.target.value })}
            maxLength={7}
            className="w-24 px-2 py-1 border border-black/[0.08] rounded-md text-[12px] text-center font-mono focus:border-brand-500 focus:outline-none"
          />
          <div
            className="w-6 h-6 rounded-md border border-black/5"
            style={{ backgroundColor: draft.brandColor }}
          />
        </div>
      </div>

      {error && (
        <div className="text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
      )}

      <Button fullWidth size="lg" onClick={save} disabled={saving}>
        {saving ? "Зберігаю…" : "Зберегти"}
      </Button>
    </Modal>
  );
}

/* ─── Entry list ─── */

export default function SettingsScreen() {
  const { settings } = useSettings();
  const [showBusiness, setShowBusiness] = useState(false);

  const specialistTerm = settings?.specialistTerm || "Спеціаліст";
  const businessName = businessPresets[settings?.businessType || "beauty"].label;

  const cards = [
    {
      icon: "🏢",
      title: "Параметри бізнесу",
      desc: settings
        ? `${businessName} · ${settings.currency} · ${settings.name}`
        : "Тип, назва, валюта, колір",
      onClick: () => setShowBusiness(true),
    },
    { icon: "📋", title: "Каталог послуг", desc: "Калькуляції матеріалів" },
    { icon: "📦", title: "Матеріали та товари", desc: "Ціни закупки / продажу" },
    { icon: "👥", title: "Управління персоналом", desc: `${specialistTerm}и · ставки, %` },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight mb-4">Налаштування</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={card.onClick}
            className={`bg-white rounded-xl border border-black/[0.06] p-4 transition-all ${
              card.onClick ? "cursor-pointer hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]" : "opacity-70"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center text-base">
                {card.icon}
              </div>
              <div>
                <div className="text-[13px] font-semibold text-gray-900">{card.title}</div>
                <div className="text-[11px] text-gray-400">{card.desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showBusiness && <BusinessSettingsModal onClose={() => setShowBusiness(false)} />}
    </div>
  );
}
