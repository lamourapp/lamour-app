"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PinPad from "@/components/PinPad";
import CalendarPicker from "@/components/CalendarPicker";
import ExpensesBlock from "@/components/owner/ExpensesBlock";
import SpecialistsBlock from "@/components/owner/SpecialistsBlock";
import ServicesBlock from "@/components/owner/ServicesBlock";
import ProductsBlock from "@/components/owner/ProductsBlock";
import AlertsBlock from "@/components/owner/AlertsBlock";
import HeroMetrics from "@/components/owner/HeroMetrics";
import CashStatus from "@/components/owner/CashStatus";
import OwedMasters from "@/components/owner/OwedMasters";
import PnlBlock from "@/components/owner/PnlBlock";
import TrendChart from "@/components/owner/TrendChart";
import type {
  SpecialistRow,
  ServiceRow,
  ServiceTypeSlice,
  ProductRow,
  RiskAlert,
} from "@/app/api/owner/stats/route";
import type { MasterOwed } from "@/app/api/owner/balances/route";
import { useSettings } from "@/lib/hooks";

const SESSION_KEY = "servico.owner.unlocked";

type Period = "today" | "week" | "month" | "quarter" | "year" | "custom";

const periodButtons: { id: Period; label: string }[] = [
  { id: "today", label: "День" },
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
  { id: "year", label: "Рік" },
];

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
  netMaterials: number;
  netSales: number;
  netSalon: number;
  masterPay: number;
  expensesTotal: number;
  margin: number;
  count: number;
  ownerWithdrawals: number;
  ownerContributions: number;
  cashByMethod: { cash: number; card: number; unknown: number };
  revenueByMethod: { cash: number; card: number; unknown: number };
  expensesByMethod: { cash: number; card: number; unknown: number };
  countRevenue: number;
}

interface Balances {
  cashByMethod: { cash: number; card: number; unknown: number };
  cashTotal: number;
  owedToMasters: MasterOwed[];
  owedTotal: number;
}

interface StatsResponse {
  current: Aggregates;
  previous: Aggregates;
  expensesByCategory: { name: string; value: number }[];
  daily: { date: string; revenue: number; net: number }[];
  specialists: SpecialistRow[];
  topServices: ServiceRow[];
  serviceTypes: ServiceTypeSlice[];
  topProducts: ProductRow[];
  alerts: RiskAlert[];
  range: { from: string; to: string };
}

function formatDMY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ─── Period → date range helper ───────────────────────────────────────────
function rangeForPeriod(period: Period, now: Date = new Date()): { from: string; to: string } | null {
  if (period === "custom") return null;
  const end = new Date(now);
  const start = new Date(now);
  if (period === "today") {
    // leave start=now
  } else if (period === "week") {
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
  } else if (period === "month") {
    start.setDate(1);
  } else if (period === "quarter") {
    const qStartMonth = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(qStartMonth, 1);
  } else if (period === "year") {
    start.setMonth(0, 1);
  }
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}

// ─── PIN gate ─────────────────────────────────────────────────────────────
function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [resetSignal, setReset] = useState(0);
  const [hasPin, setHasPin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "" }),
    })
      .then((r) => r.json())
      .then((d) => setHasPin(Boolean(d?.hasPin)))
      .catch(() => setHasPin(false));
  }, []);

  async function handleSubmit(pin: string) {
    if (checking) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onUnlock();
      } else {
        setError("Невірний PIN");
        setReset((n) => n + 1);
      }
    } catch {
      setError("Помилка з'єднання");
      setReset((n) => n + 1);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-black/[0.06] p-8 w-full max-w-sm shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-xl">
            🔒
          </div>
          <h1 className="text-[16px] font-semibold text-gray-900">Аналітика власника</h1>
          <p className="text-[12px] text-gray-400 mt-1">
            {hasPin === false
              ? "PIN ще не встановлений — налаштуйте у розділі «Налаштування»"
              : "Введіть PIN для входу"}
          </p>
        </div>

        {hasPin !== false && (
          <PinPad onComplete={handleSubmit} resetSignal={resetSignal} disabled={checking} />
        )}

        {error && (
          <div className="mt-4 text-[12px] text-red-500 text-center">{error}</div>
        )}

        <div className="mt-6 text-center">
          <Link href="/" className="text-[12px] text-gray-400 hover:text-gray-600 transition-colors">
            ← На головну
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────
export default function OwnerScreen() {
  const [unlocked, setUnlocked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [period, setPeriod] = useState<Period>("month");
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);

  const { settings } = useSettings();

  useEffect(() => {
    setHydrated(true);
    if (sessionStorage.getItem(SESSION_KEY) === "1") setUnlocked(true);
  }, []);

  const range = useMemo(() => {
    if (period === "custom" && customRange) return customRange;
    return rangeForPeriod(period);
  }, [period, customRange]);

  // Lifetime balances — fetch one раз після unlock, не залежать від періоду.
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetch(`/api/owner/balances`)
      .then((r) => r.json() as Promise<Balances>)
      .then((d) => { if (!cancelled) setBalances(d); })
      .catch(() => { /* не критично, блок просто не рендериться */ });
    return () => { cancelled = true; };
  }, [unlocked]);

  // Fetch stats whenever range changes (and we're unlocked)
  useEffect(() => {
    if (!unlocked || !range) return;
    let cancelled = false;
    setStatsLoading(true);
    setStatsError(null);
    fetch(`/api/owner/stats?from=${range.from}&to=${range.to}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<StatsResponse>;
      })
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((e) => {
        if (!cancelled) setStatsError(e instanceof Error ? e.message : "Помилка");
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [unlocked, range]);

  const periodLabel = useMemo(() => {
    if (period === "custom" && customRange) {
      return `${formatDMY(customRange.from)} — ${formatDMY(customRange.to)}`;
    }
    switch (period) {
      case "today": return "Сьогодні";
      case "week": return "Цей тиждень";
      case "month": return "Цей місяць";
      case "quarter": return "Цей квартал";
      case "year": return "Цей рік";
      default: return "";
    }
  }, [period, customRange]);

  function selectPeriod(p: Period) {
    setPeriod(p);
    setCustomRange(null);
    setShowCalendar(false);
  }

  function handleCalendarApply(from: string, to: string) {
    setCustomRange({ from, to });
    setPeriod("custom");
    setShowCalendar(false);
  }

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false);
  }

  if (!hydrated) return null;
  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />;

  const current = stats?.current;
  const previous = stats?.previous;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white/80 backdrop-blur-xl border-b border-black/5 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[13px] text-gray-500 hover:text-gray-900 transition-colors">
            <span>←</span>
            <span>{settings?.name || "Servico"}</span>
          </Link>
          <div className="hidden sm:block text-[11px] font-semibold text-brand-600 uppercase tracking-wider">
            🔓 Аналітика власника
          </div>
          <button
            onClick={lock}
            className="text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            Заблокувати
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-5">
        {/* Period filter */}
        <div className="bg-white rounded-2xl border border-black/[0.06] p-3 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Показники</h2>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {periodLabel}
                {statsLoading
                  ? " · завантаження…"
                  : stats
                    ? ` · ${stats.current.count} записів`
                    : ""}
              </p>
            </div>

            <div className="relative -mx-3 sm:mx-0">
              <div className="flex gap-1 bg-[#f5f5f7] rounded-xl p-0.5 overflow-x-auto sm:flex-wrap mx-3 sm:mx-0">
              {periodButtons.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPeriod(p.id)}
                  className={`px-3 py-2 rounded-[10px] text-[13px] font-medium cursor-pointer transition-all shrink-0 ${
                    period === p.id && !customRange
                      ? "bg-brand-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCalendar((v) => !v)}
                className={`px-2.5 py-2 rounded-[10px] text-[13px] cursor-pointer transition-all shrink-0 inline-flex items-center gap-1 ${
                  period === "custom" || showCalendar
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                }`}
                title="Обрати діапазон"
                aria-label="Обрати діапазон"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 00-2 2z" />
                </svg>
              </button>
              </div>

              {showCalendar && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowCalendar(false)}
                    aria-hidden="true"
                  />
                  <div className="absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-2rem)] bg-white border border-black/[0.08] rounded-2xl shadow-xl p-3 z-50">
                    <CalendarPicker
                      onClose={() => setShowCalendar(false)}
                      onApply={handleCalendarApply}
                      initialFrom={customRange?.from}
                      initialTo={customRange?.to}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {statsError && (
          <div className="mb-4 text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            Помилка завантаження: {statsError}
          </div>
        )}

        {/* HERO: 5 KPI-карток в одну стрічку — «температура бізнесу» за 5 сек,
            без скролу. Дельти vs попередній період одразу поруч з числом. */}
        <HeroMetrics
          current={current ?? emptyAgg()}
          previous={previous ?? emptyAgg()}
          balances={balances}
          settings={settings}
          loading={statsLoading}
        />

        {/* ALERTS: banner-стрічка одразу під hero. Якщо alerts немає — не
            рендериться, не залишає порожнього блока. */}
        <AlertsBlock alerts={stats?.alerts ?? []} loading={statsLoading} />

        {/* 12-колонковий dashboard grid. Зонований:
              Row 1: 8/4 — головний trend-chart + sidebar (каса + борги)
              Row 2: 6/6 — P&L + Витрати по категоріях
              Row 3: 6/6 — Послуги + Продукти (парні top-10, однотипні)
              Row 4: 12  — Майстри (таблиця хоче ширини)
            На мобільному все стакається (grid-cols-1). */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Row 1 */}
          <TrendChart
            className="lg:col-span-8"
            daily={stats?.daily ?? []}
            current={current ?? emptyAgg()}
            previous={previous ?? emptyAgg()}
            settings={settings}
            loading={statsLoading}
          />
          <div className="lg:col-span-4 flex flex-col gap-3">
            <CashStatus balances={balances} settings={settings} />
            {balances && (
              <OwedMasters
                owedToMasters={balances.owedToMasters}
                owedTotal={balances.owedTotal}
                settings={settings}
              />
            )}
          </div>

          {/* Row 2 */}
          <div className="lg:col-span-6">
            <PnlBlock
              current={current ?? emptyAgg()}
              settings={settings}
              loading={statsLoading}
            />
          </div>
          <div className="lg:col-span-6">
            <ExpensesBlock
              data={stats?.expensesByCategory ?? []}
              total={current?.expensesTotal ?? 0}
              settings={settings}
              loading={statsLoading}
            />
          </div>

          {/* Row 3 — парні top-10 блоки (послуги + товари, одна ментальна
              модель: «що найбільше продається»). */}
          <div className="lg:col-span-6">
            <ServicesBlock
              top={stats?.topServices ?? []}
              types={stats?.serviceTypes ?? []}
              settings={settings}
              loading={statsLoading}
            />
          </div>
          <div className="lg:col-span-6">
            <ProductsBlock
              top={stats?.topProducts ?? []}
              settings={settings}
              loading={statsLoading}
            />
          </div>

          {/* Row 4 — таблиця майстрів. Повна ширина, щоб колонки дихали. */}
          <div className="lg:col-span-12">
            <SpecialistsBlock
              data={stats?.specialists ?? []}
              settings={settings}
              loading={statsLoading}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

function emptyAgg(): Aggregates {
  return {
    revenueServices: 0,
    revenueMaterials: 0,
    revenueSales: 0,
    netMaterials: 0,
    netSales: 0,
    netSalon: 0,
    masterPay: 0,
    expensesTotal: 0,
    margin: 0,
    count: 0,
    ownerWithdrawals: 0,
    ownerContributions: 0,
    cashByMethod: { cash: 0, card: 0, unknown: 0 },
    revenueByMethod: { cash: 0, card: 0, unknown: 0 },
    expensesByMethod: { cash: 0, card: 0, unknown: 0 },
    countRevenue: 0,
  };
}
