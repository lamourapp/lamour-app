// Single source of truth for the mapping between the internal
// `CompensationType` enum and the Ukrainian strings we keep in Airtable's
// "Тип оплати" singleSelect. Every API route that reads/writes specialists
// goes through these helpers — keeps the mapping consistent and easy to
// migrate to a proper enum column when we move to Postgres.

import type { CompensationType } from "./types";

export const COMPENSATION_LABELS: Record<CompensationType, string> = {
  commission: "комісія",
  rental: "оренда",
  hourly: "погодинна",
  salary: "зарплата",
  // Власник — не виплачується, а вилучає прибуток. Тип потрібен лише
  // для явного рендеру (жодних полів ставок не показуємо).
  owner: "власник",
};

const LABEL_TO_TYPE: Record<string, CompensationType> = {
  "комісія": "commission",
  "оренда": "rental",
  "погодинна": "hourly",
  "зарплата": "salary",
  "власник": "owner",
};

export function labelFromCompensationType(type: CompensationType): string {
  return COMPENSATION_LABELS[type] ?? COMPENSATION_LABELS.commission;
}

/** Reverse: read Airtable's singleSelect string back into our union. */
export function compensationTypeFromLabel(label: string | undefined | null): CompensationType {
  if (!label) return "commission";
  return LABEL_TO_TYPE[label] ?? "commission";
}
