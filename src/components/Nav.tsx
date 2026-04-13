"use client";

type Screen = "journal" | "staff" | "dashboard" | "settings";

interface NavProps {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  locationName?: string;
}

const tabs: { id: Screen; label: string; icon: string }[] = [
  { id: "journal", label: "Журнал", icon: "📋" },
  { id: "staff", label: "Співробітники", icon: "👥" },
  { id: "dashboard", label: "Дашборд", icon: "📊" },
  { id: "settings", label: "Налаштування", icon: "⚙️" },
];

export default function Nav({ active, onNavigate, locationName }: NavProps) {
  return (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-semibold text-xs">L</span>
            </div>
            <span className="font-semibold text-[15px] text-gray-900 hidden sm:block tracking-tight">
              Lamour
            </span>
          </div>
          <div className="flex gap-0.5 sm:gap-5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                className={`relative px-3 py-3.5 text-[13px] font-medium cursor-pointer transition-colors
                  ${active === tab.id ? "text-brand-600" : "text-gray-500 hover:text-brand-700"}`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden text-base">{tab.icon}</span>
                {active === tab.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-brand-600 rounded-sm" />
                )}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-gray-400 hidden md:block tracking-wide">
            {locationName || "Салон «Лямурчик»"}
          </div>
        </div>
      </div>
    </nav>
  );
}
