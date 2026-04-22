"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import type { Specialist, JournalEntry } from "./types";
import type { Settings } from "@/app/api/settings/route";

/* ─── Settings (tenant-wide, shared cache) ─── */

type SettingsStore = {
  data: Settings | null;
  loading: boolean;
  error: string | null;
};

const LS_KEY = "servico.settings";

function readLS(): Settings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Settings) : null;
  } catch {
    return null;
  }
}

function writeLS(s: Settings | null) {
  if (typeof window === "undefined") return;
  try {
    if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore quota */
  }
}

/**
 * Apply brand color to the CSS variable so every brand-* Tailwind class
 * re-derives (all shades are color-mix'd from --brand-600).
 */
function applyBrandColor(hex: string | undefined) {
  if (typeof document === "undefined") return;
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  document.documentElement.style.setProperty("--brand-600", hex);
}

let settingsStore: SettingsStore = {
  data: null,
  loading: true,
  error: null,
};
const listeners = new Set<() => void>();

function setStore(next: Partial<SettingsStore>) {
  settingsStore = { ...settingsStore, ...next };
  listeners.forEach((fn) => fn());
}

let inflight: Promise<void> | null = null;

async function refetchSettings(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      const data = (await res.json()) as Settings;
      writeLS(data);
      applyBrandColor(data.brandColor);
      setStore({ data, loading: false, error: null });
    } catch (err) {
      setStore({ loading: false, error: err instanceof Error ? err.message : "Error" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function subscribeSettings(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return settingsStore;
}

// SSR needs a stable snapshot too — always return the initial null store.
const SSR_SNAPSHOT: SettingsStore = { data: null, loading: true, error: null };
function getServerSnapshot() {
  return SSR_SNAPSHOT;
}

export function useSettings() {
  const store = useSyncExternalStore(subscribeSettings, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // Hydrate from LS immediately (no flash) if we haven't yet.
    if (!settingsStore.data) {
      const cached = readLS();
      if (cached) setStore({ data: cached });
    }
    // Always revalidate from the server on mount.
    if (!settingsStore.data || settingsStore.loading) {
      refetchSettings();
    }
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    const data = (await res.json()) as Settings;
    writeLS(data);
    applyBrandColor(data.brandColor);
    setStore({ data, error: null });
    return data;
  }, []);

  return {
    settings: store.data,
    loading: store.loading,
    error: store.error,
    reload: refetchSettings,
    update,
  };
}

/* ─── Catalog (products & materials) ─── */

export interface CatalogProduct {
  id: string; name: string; salePrice: number; costPrice: number;
  group: string; sku: string; article: string; barcode: string;
  price: number; isActive: boolean;
}
export interface CatalogMaterial {
  id: string; name: string; salePrice: number; costPrice: number;
  totalVolume: number; pricePerUnit: number; costPerUnit: number;
  group: string; unit: string; sku: string; article: string; barcode: string;
  isActive: boolean;
}

export function useCatalog<T extends "products" | "materials">(type: T) {
  type Item = T extends "products" ? CatalogProduct : CatalogMaterial;
  const [data, setData] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/${type}?_t=${Date.now()}`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [type]);

  useEffect(() => { reload(); }, [reload]);

  return { items: data, loading, error, reload };
}

/* ─── Services catalog ─── */

export interface ServiceCatalogItem {
  id: string; name: string; workPrice: number; hourlyRate: number;
  hours: number; materialsCost: number; totalPrice: number;
  categoryId: string; duration: number; isActive: boolean;
}

export function useServicesCatalog() {
  const [data, setData] = useState<ServiceCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/services-catalog?_t=${Date.now()}`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { services: data, loading, error, reload };
}

/* ─── Categories (service taxonomy, tenant-defined) ─── */

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  description: string;
  /**
   * true для категорії що представляє оренду робочого місця. Master/salon split
   * рахується інакше (вся сума йде салону). Замінює магічну перевірку по name.
   */
  isRental: boolean;
}

export function useCategories(includeInactive = false) {
  const [data, setData] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (includeInactive) params.set("all", "1");
    params.set("_t", String(Date.now()));
    fetch(`/api/categories?${params.toString()}`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [includeInactive]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (payload: { name: string; description?: string; sortOrder?: number }): Promise<string> => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    const { id } = (await res.json()) as { id: string };
    await new Promise<void>((resolve) => {
      fetch(`/api/categories?all=1&_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Category[]) => { setData(d); resolve(); })
        .catch(() => resolve());
    });
    return id;
  }, []);

  return { categories: data, loading, error, reload, create };
}

/* ─── Specializations (tenant-defined roles) ─── */

export interface Specialization {
  id: string;
  name: string;
  categoryIds: string[];
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export function useSpecializations(includeInactive = false) {
  const [data, setData] = useState<Specialization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (includeInactive) params.set("all", "1");
    params.set("_t", String(Date.now()));
    fetch(`/api/specializations?${params.toString()}`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [includeInactive]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (payload: {
    name: string;
    categoryIds?: string[];
    description?: string;
    sortOrder?: number;
  }): Promise<Specialization> => {
    const res = await fetch("/api/specializations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    const { id } = (await res.json()) as { id: string };
    await new Promise<void>((resolve) => {
      fetch(`/api/specializations?_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: Specialization[]) => { setData(d); resolve(); })
        .catch(() => resolve());
    });
    return {
      id,
      name: payload.name,
      categoryIds: payload.categoryIds || [],
      description: payload.description || "",
      isActive: true,
      sortOrder: payload.sortOrder ?? 0,
    };
  }, []);

  return { specializations: data, loading, error, reload, create };
}

/* ─── Expense types (tenant-defined taxonomy) ─── */

export interface ExpenseType {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  description: string;
}

export function useExpenseTypes(includeInactive = false) {
  const [data, setData] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (includeInactive) params.set("all", "1");
    params.set("_t", String(Date.now()));
    fetch(`/api/expense-types?${params.toString()}`, { cache: "no-store" })
      .then((res) => { if (!res.ok) throw new Error("Failed"); return res.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [includeInactive]);

  useEffect(() => { reload(); }, [reload]);

  const create = useCallback(async (payload: { name: string; description?: string; sortOrder?: number }): Promise<ExpenseType> => {
    const res = await fetch("/api/expense-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    const { id, name } = (await res.json()) as { id: string; name: string };
    await new Promise<void>((resolve) => {
      fetch(`/api/expense-types?all=1&_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: ExpenseType[]) => { setData(d); resolve(); })
        .catch(() => resolve());
    });
    return {
      id, name,
      description: payload.description || "",
      sortOrder: payload.sortOrder ?? 0,
      isActive: true,
    };
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Omit<ExpenseType, "id">>): Promise<void> => {
    const res = await fetch("/api/expense-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed");
    await new Promise<void>((resolve) => {
      fetch(`/api/expense-types?all=1&_t=${Date.now()}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: ExpenseType[]) => { setData(d); resolve(); })
        .catch(() => resolve());
    });
  }, []);

  return { expenseTypes: data, loading, error, reload, create, update };
}

export function useSpecialists(includeInactive = false) {
  const [data, setData] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (includeInactive) params.set("all", "1");
    params.set("_t", String(Date.now()));
    fetch(`/api/specialists?${params.toString()}`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [includeInactive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { specialists: data, loading, error, reload };
}

export function useJournal(
  period: string = "month",
  specialistId: string = "",
  dateFrom?: string,
  dateTo?: string,
  includeCanceled: boolean = false,
) {
  const [data, setData] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Pull timezone from shared settings store so /api/journal can format
  // "Created" timestamps in the tenant's local time.
  const tz = settingsStore.data?.timezone;

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();

    if (dateFrom && dateTo) {
      params.set("from", dateFrom);
      params.set("to", dateTo);
    } else {
      params.set("period", period);
    }

    if (specialistId) params.set("specialist", specialistId);
    if (tz) params.set("tz", tz);
    if (includeCanceled) params.set("includeCanceled", "1");

    params.set("_t", String(Date.now())); // cache-bust
    fetch(`/api/journal?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [period, specialistId, dateFrom, dateTo, tz, includeCanceled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries: data, loading, error, reload };
}
