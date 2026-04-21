import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, updateRecord, TABLES } from "@/lib/airtable";
import { SETTINGS_FIELDS } from "@/lib/airtable-fields";

export interface Settings {
  id: string;
  name: string;
  currency: "UAH" | "USD" | "EUR" | "PLN";
  businessType: "beauty" | "barber" | "cosmetology" | "dental" | "auto" | "custom";
  specialistTerm: string;
  locationTerm: string;
  brandColor: string;
  timezone: string;
  hasPin: boolean;
  /** Locked after first successful save. When true, currency is read-only in UI. */
  isOnboarded: boolean;
  /** Alert thresholds, stored as integer percents (15 = 15%). */
  alertNetDropWarn: number;   // MoM net drop → warning
  alertNetDropCrit: number;   // MoM net drop → critical
  alertExpensesHigh: number;  // expenses share of revenue → warning
  alertLowMargin: number;     // margin floor → info
}

const DEFAULTS: Omit<Settings, "id" | "hasPin" | "isOnboarded"> = {
  name: "Салон «Лямурчик»",
  currency: "UAH",
  businessType: "beauty",
  specialistTerm: "Майстер",
  locationTerm: "Салон",
  brandColor: "#9333ea",
  timezone: "Europe/Kyiv",
  alertNetDropWarn: 15,
  alertNetDropCrit: 30,
  alertExpensesHigh: 60,
  alertLowMargin: 20,
};

function mapSettings(r: { id: string; fields: Record<string, unknown> }): Settings {
  const f = r.fields;
  return {
    id: r.id,
    name: (f[SETTINGS_FIELDS.name] as string) || DEFAULTS.name,
    currency: ((f[SETTINGS_FIELDS.currency] as string) || DEFAULTS.currency) as Settings["currency"],
    businessType: ((f[SETTINGS_FIELDS.businessType] as string) || DEFAULTS.businessType) as Settings["businessType"],
    specialistTerm: (f[SETTINGS_FIELDS.specialistTerm] as string) || DEFAULTS.specialistTerm,
    locationTerm: (f[SETTINGS_FIELDS.locationTerm] as string) || DEFAULTS.locationTerm,
    brandColor: (f[SETTINGS_FIELDS.brandColor] as string) || DEFAULTS.brandColor,
    timezone: (f[SETTINGS_FIELDS.timezone] as string) || DEFAULTS.timezone,
    hasPin: Boolean((f[SETTINGS_FIELDS.pinHash] as string)?.trim()),
    isOnboarded: Boolean(f[SETTINGS_FIELDS.isOnboarded]),
    alertNetDropWarn: numOr(f[SETTINGS_FIELDS.alertNetDropWarn], DEFAULTS.alertNetDropWarn),
    alertNetDropCrit: numOr(f[SETTINGS_FIELDS.alertNetDropCrit], DEFAULTS.alertNetDropCrit),
    alertExpensesHigh: numOr(f[SETTINGS_FIELDS.alertExpensesHigh], DEFAULTS.alertExpensesHigh),
    alertLowMargin: numOr(f[SETTINGS_FIELDS.alertLowMargin], DEFAULTS.alertLowMargin),
  };
}

function numOr(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function loadCurrent(): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const records = await fetchAllRecords(TABLES.settings, {
    filterByFormula: `{key} = "current"`,
  });
  return records[0] ?? null;
}

export async function GET() {
  try {
    const record = await loadCurrent();
    if (!record) {
      return NextResponse.json({ error: "Settings row 'current' not found" }, { status: 404 });
    }
    return NextResponse.json(mapSettings(record));
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const record = await loadCurrent();
    if (!record) {
      return NextResponse.json({ error: "Settings row 'current' not found" }, { status: 404 });
    }

    const currentlyOnboarded = Boolean(record.fields[SETTINGS_FIELDS.isOnboarded]);

    const fields: Record<string, unknown> = {};
    if (typeof body.name === "string") fields[SETTINGS_FIELDS.name] = body.name;
    // Currency is locked after onboarding — ignore incoming changes to preserve history integrity.
    if (typeof body.currency === "string" && !currentlyOnboarded) fields[SETTINGS_FIELDS.currency] = body.currency;
    if (typeof body.businessType === "string") fields[SETTINGS_FIELDS.businessType] = body.businessType;
    if (typeof body.specialistTerm === "string") fields[SETTINGS_FIELDS.specialistTerm] = body.specialistTerm;
    if (typeof body.locationTerm === "string") fields[SETTINGS_FIELDS.locationTerm] = body.locationTerm;
    if (typeof body.brandColor === "string") fields[SETTINGS_FIELDS.brandColor] = body.brandColor;
    if (typeof body.timezone === "string") fields[SETTINGS_FIELDS.timezone] = body.timezone;
    // Alert thresholds — optional, clamped sanity bounds
    for (const key of ["alertNetDropWarn", "alertNetDropCrit", "alertExpensesHigh", "alertLowMargin"] as const) {
      const v = body[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) {
        fields[SETTINGS_FIELDS[key]] = Math.round(v);
      }
    }
    // Auto-seal the tenant the first time settings are saved successfully.
    if (!currentlyOnboarded) fields[SETTINGS_FIELDS.isOnboarded] = true;
    // pinHash is set via dedicated endpoint later — not writable here

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const updated = await updateRecord(TABLES.settings, record.id, fields);
    return NextResponse.json(mapSettings(updated));
  } catch (error) {
    console.error("Failed to update settings:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
