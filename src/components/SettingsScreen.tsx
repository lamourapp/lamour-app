"use client";

import { useState } from "react";

const businessPresets: Record<string, { label: string; desc: string; specialist: string; location: string }> = {
  beauty:      { label: "Салон краси",  desc: "Майстер · Салон",       specialist: "Майстер",    location: "Салон" },
  barber:      { label: "Барбершоп",    desc: "Барбер · Барбершоп",    specialist: "Барбер",     location: "Барбершоп" },
  cosmetology: { label: "Косметологія", desc: "Косметолог · Клініка",  specialist: "Косметолог", location: "Клініка" },
  auto:        { label: "Автосервіс",   desc: "Механік · Сервіс",     specialist: "Механік",    location: "Сервіс" },
  dental:      { label: "Стоматологія", desc: "Лікар · Клініка",      specialist: "Лікар",      location: "Клініка" },
  custom:      { label: "Інше",         desc: "Свої назви",            specialist: "",           location: "" },
};

const accentColors = [
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

function SettingsModal({ onClose }: { onClose: () => void }) {
  const [activePreset, setActivePreset] = useState("beauty");
  const [specialist, setSpecialist] = useState("Майстер");
  const [location, setLocation] = useState("Салон");
  const [activeColor, setActiveColor] = useState("#9333ea");
  const [hexInput, setHexInput] = useState("#9333ea");

  function selectPreset(key: string) {
    setActivePreset(key);
    const p = businessPresets[key];
    setSpecialist(p.specialist);
    setLocation(p.location);
  }

  function selectColor(color: string) {
    setActiveColor(color);
    setHexInput(color);
  }

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/5">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-gray-900">Параметри бізнесу</h3>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 cursor-pointer transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Назва</label>
            <input type="text" defaultValue="Лямурчик" className="w-full mt-1.5 px-3 py-2 border border-black/[0.08] rounded-lg text-[13px] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/20 transition-colors" />
          </div>

          {/* Currency */}
          <div>
            <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Валюта</label>
            <select className="w-full mt-1.5 px-3 py-2 border border-black/[0.08] rounded-lg text-[13px] focus:border-brand-500 focus:outline-none cursor-pointer">
              <option>₴ — гривня (UAH)</option>
              <option>$ — долар (USD)</option>
              <option>€ — євро (EUR)</option>
              <option>zł — злотий (PLN)</option>
            </select>
          </div>

          {/* Business Type */}
          <div>
            <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Тип бізнесу</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2.5">Визначає термінологію інтерфейсу — можна змінити будь-коли</p>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(businessPresets).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => selectPreset(key)}
                  className={`text-left p-2.5 rounded-xl border-2 cursor-pointer transition-all
                    ${activePreset === key
                      ? "border-brand-500 bg-brand-50/50"
                      : "border-transparent bg-gray-50 hover:border-gray-200"}`}
                >
                  <div className="text-[12px] font-semibold text-gray-900">{preset.label}</div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{preset.desc}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-2 p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <label className="text-[11px] text-gray-400 w-28 shrink-0">Спеціаліст:</label>
                <input
                  type="text"
                  value={specialist}
                  onChange={(e) => setSpecialist(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-black/[0.08] rounded-lg text-[12px] focus:border-brand-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-[11px] text-gray-400 w-28 shrink-0">Локація:</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-black/[0.08] rounded-lg text-[12px] focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-black/5" />

          {/* Accent Color */}
          <div>
            <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">Акцентний колір</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2.5">Кнопки, виділення, логотип — все підлаштується під ваш бренд</p>
            <div className="flex gap-2 flex-wrap">
              {accentColors.map((c) => (
                <button
                  key={c.color}
                  onClick={() => selectColor(c.color)}
                  title={c.title}
                  className="w-10 h-10 rounded-xl cursor-pointer transition-all hover:scale-105"
                  style={{
                    backgroundColor: c.color,
                    boxShadow: activeColor === c.color
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
                value={hexInput}
                onChange={(e) => { setHexInput(e.target.value); setActiveColor(e.target.value); }}
                maxLength={7}
                className="w-20 px-2 py-1 border border-black/[0.08] rounded-md text-[12px] text-center font-mono focus:border-brand-500 focus:outline-none"
              />
              <div className="w-6 h-6 rounded-md border border-black/5" style={{ backgroundColor: activeColor }} />
            </div>
          </div>

          <div className="h-px bg-black/5" />

          {/* PIN */}
          <div>
            <label className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">PIN власника</label>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-2">4-значний код для доступу до розширеної аналітики</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <input
                  key={i}
                  type="password"
                  maxLength={1}
                  defaultValue="•"
                  className="w-10 h-11 text-center text-lg border border-black/10 rounded-lg focus:border-brand-500 focus:outline-none"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-black/5">
          <button onClick={onClose} className="w-full py-3 bg-brand-600 text-white rounded-[10px] font-medium text-[14px] cursor-pointer hover:bg-brand-700 transition-colors">
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsScreen() {
  const [showSettings, setShowSettings] = useState(false);

  const cards = [
    { icon: "🏢", title: "Параметри бізнесу", desc: "Тип, назва, валюта, колір, PIN", onClick: () => setShowSettings(true) },
    { icon: "📋", title: "Каталог послуг", desc: "Калькуляції матеріалів" },
    { icon: "📦", title: "Матеріали та товари", desc: "Ціни закупки / продажу" },
    { icon: "👥", title: "Управління персоналом", desc: "10 співробітників · ставки, %" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight mb-4">Налаштування</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {cards.map((card) => (
          <div
            key={card.title}
            onClick={card.onClick}
            className="bg-white rounded-xl border border-black/[0.06] p-4 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
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

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
