"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import type { Specialist, JournalEntry } from "./demo-data";
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
  }, [period, specialistId, dateFrom, dateTo, tz]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries: data, loading, error, reload };
}
