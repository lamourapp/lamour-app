// POST /api/auth/login — app-level gate login.
// Body: { pin: string }
// Response: { ok: true } on success (with Set-Cookie), { error } on failure.
//
// Окремий від /api/auth/pin (той — owner-section PIN, інше призначення).
// SALON_PIN зберігається у Vercel env vars (recovery → змінити там).
//
// Brute-force захист: 6 цифр = 1M комбінацій, без rate-limit перебірабельні.
// MVP: робимо delay 700ms на кожну спробу (slowdown). Атакувальнику ~1 тиждень
// при 1 RPS — достатньо для нашого порогу. Real rate-limit — окремою задачею.

import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-session";

export const runtime = "nodejs";

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const pin =
    body && typeof body === "object" && "pin" in body && typeof (body as { pin: unknown }).pin === "string"
      ? (body as { pin: string }).pin.trim()
      : "";

  const expected = process.env.SALON_PIN;
  if (!expected) {
    return NextResponse.json(
      { error: "Gate не налаштовано (SALON_PIN відсутній)" },
      { status: 500 },
    );
  }

  // Невеликий slowdown — гальмує перебір на 6 цифр без явного rate-limit.
  await new Promise((r) => setTimeout(r, 700));

  if (!timingSafeStringEqual(pin, expected)) {
    return NextResponse.json({ error: "Невірний PIN" }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Auth error" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
