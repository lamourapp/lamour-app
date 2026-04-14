import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, updateRecord, TABLES } from "@/lib/airtable";

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
}

const DEFAULTS: Omit<Settings, "id" | "hasPin" | "isOnboarded"> = {
  name: "Салон «Лямурчик»",
  currency: "UAH",
  businessType: "beauty",
  specialistTerm: "Майстер",
  locationTerm: "Салон",
  brandColor: "#9333ea",
  timezone: "Europe/Kyiv",
};

function mapSettings(r: { id: string; fields: Record<string, unknown> }): Settings {
  const f = r.fields;
  return {
    id: r.id,
    name: (f.name as string) || DEFAULTS.name,
    currency: ((f.currency as string) || DEFAULTS.currency) as Settings["currency"],
    businessType: ((f.businessType as string) || DEFAULTS.businessType) as Settings["businessType"],
    specialistTerm: (f.specialistTerm as string) || DEFAULTS.specialistTerm,
    locationTerm: (f.locationTerm as string) || DEFAULTS.locationTerm,
    brandColor: (f.brandColor as string) || DEFAULTS.brandColor,
    timezone: (f.timezone as string) || DEFAULTS.timezone,
    hasPin: Boolean((f.pinHash as string)?.trim()),
    isOnboarded: Boolean(f.isOnboarded),
  };
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

    const currentlyOnboarded = Boolean(record.fields.isOnboarded);

    const fields: Record<string, unknown> = {};
    if (typeof body.name === "string") fields.name = body.name;
    // Currency is locked after onboarding — ignore incoming changes to preserve history integrity.
    if (typeof body.currency === "string" && !currentlyOnboarded) fields.currency = body.currency;
    if (typeof body.businessType === "string") fields.businessType = body.businessType;
    if (typeof body.specialistTerm === "string") fields.specialistTerm = body.specialistTerm;
    if (typeof body.locationTerm === "string") fields.locationTerm = body.locationTerm;
    if (typeof body.brandColor === "string") fields.brandColor = body.brandColor;
    if (typeof body.timezone === "string") fields.timezone = body.timezone;
    // Auto-seal the tenant the first time settings are saved successfully.
    if (!currentlyOnboarded) fields.isOnboarded = true;
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
