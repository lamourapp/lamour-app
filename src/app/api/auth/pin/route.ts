// POST /api/auth/pin — verify a PIN attempt against Settings.pinHash.
// Body: { pin: string }
// Response: { ok: boolean, hasPin: boolean }
//
// When no PIN is configured yet, hasPin=false and ok=false; the client
// should redirect user to set a PIN in Settings → Безпека.

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import { verifyPin } from "@/lib/pin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const pin = typeof body?.pin === "string" ? body.pin : "";

    const records = await fetchAllRecords(TABLES.settings, {
      filterByFormula: `{key} = "current"`,
    });
    const record = records[0];
    if (!record) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    }

    const stored = (record.fields.pinHash as string | undefined)?.trim() || "";
    const hasPin = stored.length > 0;
    const ok = hasPin && verifyPin(pin, stored);

    return NextResponse.json({ ok, hasPin });
  } catch (error) {
    console.error("Failed to verify PIN:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
