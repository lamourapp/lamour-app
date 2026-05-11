// POST /api/auth/logout — clears the session cookie.

import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
