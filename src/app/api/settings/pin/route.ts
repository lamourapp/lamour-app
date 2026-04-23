// POST   /api/settings/pin  — set/change/remove PIN.
//   Body: { newPin: string, currentPin?: string }
//   - If pinHash already exists, currentPin is REQUIRED and must match.
//   - newPin="" removes the PIN (also requires currentPin if one is set).
//   Response: { ok: true, hasPin: boolean }

import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, updateRecord, TABLES } from "@/lib/airtable";
import { hashPin, verifyPin } from "@/lib/pin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
    }
    const readStr = (k: string): string => {
      if (!body || typeof body !== "object") return "";
      const v = (body as Record<string, unknown>)[k];
      return typeof v === "string" ? v : "";
    };
    const newPin = readStr("newPin");
    const currentPin = readStr("currentPin");

    const records = await fetchAllRecords(TABLES.settings, {
      filterByFormula: `{key} = "current"`,
    });
    const record = records[0];
    if (!record) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    }

    const stored = (record.fields.pinHash as string | undefined)?.trim() || "";
    const hasExisting = stored.length > 0;

    // If a PIN already exists, caller must prove they know it.
    if (hasExisting) {
      if (!verifyPin(currentPin, stored)) {
        return NextResponse.json({ error: "Невірний поточний PIN" }, { status: 403 });
      }
    }

    // Clear vs set.
    if (newPin === "") {
      await updateRecord(TABLES.settings, record.id, { pinHash: "" });
      return NextResponse.json({ ok: true, hasPin: false });
    }

    if (!/^\d{4}$/.test(newPin)) {
      return NextResponse.json(
        { error: "PIN має бути з 4 цифр" },
        { status: 400 },
      );
    }

    const nextHash = hashPin(newPin);
    await updateRecord(TABLES.settings, record.id, { pinHash: nextHash });
    return NextResponse.json({ ok: true, hasPin: true });
  } catch (error) {
    console.error("Failed to set PIN:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
