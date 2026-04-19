"use client";

import { useEffect, useState } from "react";
import { useSettings } from "@/lib/hooks";
import { Button, Field, Input, Modal, Select } from "./ui";
import type { Settings } from "@/app/api/settings/route";
import CatalogScreen from "./CatalogScreen";
import ServicesCatalogScreen from "./ServicesCatalogScreen";
import PinPad from "./PinPad";

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
  const [savedOk, setSavedOk] = useState(false);

  // Keep local draft in sync when store hydrates.
  useEffect(() => {
    if (settings && !draft) setDraft(settings);
  }, [settings, draft]);

  // Roll back live color preview if modal closes without saving.
  useEffect(() => {
    return () => {
      if (!savedOk && settings?.brandColor) {
        document.documentElement.style.setProperty("--brand-600", settings.brandColor);
      }
    };
  }, [savedOk, settings?.brandColor]);

  if (!draft) {
    return (
      <Modal title="Параметри бізнесу" onClose={onClose}>
        <div className="py-6 text-center text-gray-400 text-[13px]">Завантаження…</div>
      </Modal>
    );
  }

  function patch(p: Partial<Settings>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    // Live preview of brand color: apply immediately so the modal itself
    // reflects the new accent. On cancel we roll back in the cleanup below.
    if (typeof p.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(p.brandColor)) {
      document.documentElement.style.setProperty("--brand-600", p.brandColor);
    }
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
        timezone: d.timezone,
      });
      setSavedOk(true);
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
          disabled={draft.isOnboarded}
        >
          <option value="UAH">₴ — гривня (UAH)</option>
          <option value="USD">$ — долар (USD)</option>
          <option value="EUR">€ — євро (EUR)</option>
          <option value="PLN">zł — злотий (PLN)</option>
        </Select>
        {draft.isOnboarded ? (
          <p className="mt-1 text-[11px] text-gray-400">
            🔒 Валюта зафіксована після першого збереження — щоб зберегти цілісність історичних сум.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-amber-600">
            ⚠️ Одноразове налаштування. Після першого збереження валюту буде заблоковано — історичні суми не конвертуються.
          </p>
        )}
      </Field>

      <Field label="Часовий пояс">
        <div className="flex gap-2">
          <Select
            value={draft.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
          >
            <option value="Europe/Kyiv">🇺🇦 Київ (Europe/Kyiv)</option>
            <option value="Europe/Dublin">🇮🇪 Дублін (Europe/Dublin)</option>
            <option value="Europe/Rome">🇮🇹 Рим (Europe/Rome)</option>
            <option value="Europe/Warsaw">🇵🇱 Варшава (Europe/Warsaw)</option>
          </Select>
          <button
            type="button"
            onClick={() => {
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (tz) patch({ timezone: tz });
            }}
            className="shrink-0 px-3 rounded-xl border border-black/10 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
            title="Взяти з браузера"
          >
            Авто
          </button>
        </div>
        <p className="mt-1 text-[11px] text-gray-400">
          Час створення записів у журналі показуватиметься у цьому поясі.
        </p>
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
          Кнопки, виділення, логотип — все підлаштується. Зберігається в акаунті.
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

/* ─── Modal: "Безпека" (PIN) ─── */

function SecurityModal({ onClose }: { onClose: () => void }) {
  const { settings, reload } = useSettings();
  const hasPin = Boolean(settings?.hasPin);

  const [mode, setMode] = useState<"idle" | "enter-current" | "enter-new" | "confirm-new" | "saving">(
    hasPin ? "enter-current" : "enter-new",
  );
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");
  const [resetSignal, setReset] = useState(0);

  async function removePin() {
    if (!hasPin) return;
    if (!currentPin) {
      setError("Введіть поточний PIN");
      return;
    }
    setMode("saving");
    setError("");
    try {
      const res = await fetch("/api/settings/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin: "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Помилка");
        setMode("enter-current");
        setReset((n) => n + 1);
        return;
      }
      await reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка мережі");
      setMode("enter-current");
    }
  }

  async function savePin() {
    setMode("saving");
    setError("");
    try {
      const res = await fetch("/api/settings/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin, newPin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Помилка");
        // On wrong current PIN we bounce back to step 1.
        if (res.status === 403) {
          setMode("enter-current");
          setCurrentPin("");
        } else {
          setMode("enter-new");
          setNewPin("");
        }
        setReset((n) => n + 1);
        return;
      }
      await reload();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Помилка мережі");
      setMode("enter-new");
    }
  }

  let title = "Безпека";
  let caption = "";
  let pad: React.ReactNode = null;

  if (mode === "enter-current") {
    title = "Поточний PIN";
    caption = "Введіть поточний PIN, щоб змінити або видалити";
    pad = (
      <PinPad
        onComplete={(pin) => {
          setCurrentPin(pin);
          setError("");
          setMode("enter-new");
          setReset((n) => n + 1);
        }}
        resetSignal={resetSignal}
      />
    );
  } else if (mode === "enter-new") {
    title = hasPin ? "Новий PIN" : "Встановити PIN";
    caption = "4 цифри — потрібні для входу в аналітику власника";
    pad = (
      <PinPad
        onComplete={(pin) => {
          setNewPin(pin);
          setError("");
          setMode("confirm-new");
          setReset((n) => n + 1);
        }}
        resetSignal={resetSignal}
      />
    );
  } else if (mode === "confirm-new") {
    title = "Повторіть PIN";
    caption = "Ще раз — для підтвердження";
    pad = (
      <PinPad
        onComplete={(pin) => {
          if (pin !== newPin) {
            setError("PIN не збігається");
            setMode("enter-new");
            setNewPin("");
            setReset((n) => n + 1);
            return;
          }
          savePin();
        }}
        resetSignal={resetSignal}
      />
    );
  } else if (mode === "saving") {
    caption = "Зберігаю…";
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="py-2">
        <p className="text-[12px] text-gray-500 text-center mb-4">{caption}</p>
        {pad}
        {error && (
          <div className="mt-4 text-[12px] text-red-500 text-center">{error}</div>
        )}

        {hasPin && mode === "enter-current" && (
          <div className="mt-5 pt-4 border-t border-black/5">
            <button
              onClick={removePin}
              disabled={!currentPin}
              className="w-full text-[12px] text-red-500 hover:text-red-600 disabled:text-gray-300 cursor-pointer disabled:cursor-not-allowed transition-colors"
            >
              Видалити PIN
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─── Entry list ─── */

export default function SettingsScreen() {
  const { settings } = useSettings();
  const [showBusiness, setShowBusiness] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"products" | "materials" | null>(null);
  const [showServicesCatalog, setShowServicesCatalog] = useState(false);

  const specialistTerm = settings?.specialistTerm || "Спеціаліст";
  const businessName = businessPresets[settings?.businessType || "beauty"].label;

  // Show sub-views
  if (showServicesCatalog) {
    return <ServicesCatalogScreen onBack={() => setShowServicesCatalog(false)} />;
  }
  if (catalogTab) {
    return (
      <CatalogScreen
        initialTab={catalogTab}
        onBack={() => setCatalogTab(null)}
      />
    );
  }

  const cards = [
    {
      icon: "🏢",
      title: "Параметри бізнесу",
      desc: settings
        ? `${businessName} · ${settings.currency} · ${settings.name}`
        : "Тип, назва, валюта, колір",
      onClick: () => setShowBusiness(true),
    },
    {
      icon: "📋",
      title: "Каталог послуг",
      desc: "Послуги, ціни, групи",
      onClick: () => setShowServicesCatalog(true),
    },
    {
      icon: "📦",
      title: "Каталог",
      desc: "Товари для продажу · матеріали для послуг",
      onClick: () => setCatalogTab("products"),
    },
    { icon: "👥", title: "Управління персоналом", desc: `${specialistTerm}и · ставки, %` },
    {
      icon: "🔒",
      title: "Безпека",
      desc: settings?.hasPin ? "PIN встановлено · змінити або видалити" : "Встановити PIN для аналітики власника",
      onClick: () => setShowSecurity(true),
    },
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
      {showSecurity && <SecurityModal onClose={() => setShowSecurity(false)} />}
    </div>
  );
}
