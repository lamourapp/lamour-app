"use client";

import { useSettings } from "@/lib/hooks";

type Screen = "journal" | "staff" | "dashboard" | "settings";

interface NavProps {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  /** Optional override; falls back to Settings.name, then a default label. */
  locationName?: string;
}

// Іконки — простий SVG, без emoji. Великим пальцем по нижній панелі на
// iPhone — основний патерн використання PWA, емодзі на маленьких кнопках
// виглядають як заглушка.
const tabs: {
  id: Screen;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}[] = [
  {
    id: "journal",
    label: "Журнал",
    icon: (active) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 5a2 2 0 012-2h12a2 2 0 012 2v16l-4-2-4 2-4-2-4 2V5z" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    id: "staff",
    label: "Команда",
    icon: (active) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 19c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15 13.5c2.5 0 6 1.7 6 4.5" />
      </svg>
    ),
  },
  {
    id: "dashboard",
    label: "Дашборд",
    icon: (active) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Налаштування",
    icon: (active) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.01a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.01a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    ),
  },
];

export default function Nav({ active, onNavigate, locationName }: NavProps) {
  const { settings } = useSettings();
  const label = locationName ?? settings?.name ?? "Салон";

  return (
    <>
      {/* Top bar — завжди. На sm+ містить таби, на мобільному тільки
          бренд + назву салону (таби їдуть у bottom-nav). */}
      <nav className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center shrink-0">
                <span className="text-white font-semibold text-xs">S</span>
              </div>
              <span className="font-semibold text-[15px] text-gray-900 tracking-tight truncate">
                {label}
              </span>
            </div>

            {/* Таби в топ-барі — тільки sm+ */}
            <div className="hidden sm:flex gap-5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className={`relative px-3 py-3.5 text-[13px] font-medium cursor-pointer transition-colors
                    ${active === tab.id ? "text-brand-600" : "text-gray-500 hover:text-brand-700"}`}
                >
                  {tab.label}
                  {active === tab.id && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-600 rounded-sm" />
                  )}
                </button>
              ))}
            </div>

            <div className="hidden md:block text-[11px] text-gray-400 tracking-wide">
              Servico
            </div>
          </div>
        </div>
      </nav>

      {/* Bottom-nav — тільки мобільний. Фіксований, з safe-area для
          iPhone з «домашньою рискою». z-index менший за модалки (50),
          але вищий за floating-ui (quick-add = z-40). */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-black/[0.06]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Основна навігація"
      >
        <div className="flex">
          {tabs.map((tab) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 cursor-pointer transition-colors ${
                  isActive ? "text-brand-600" : "text-gray-400 hover:text-gray-700"
                }`}
              >
                {tab.icon(isActive)}
                <span className="text-[10px] font-medium leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
