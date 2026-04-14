"use client";

import { useState, useEffect, useCallback } from "react";
import type { Specialist, JournalEntry } from "./demo-data";

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
  }, [period, specialistId, dateFrom, dateTo]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { entries: data, loading, error, reload };
}
