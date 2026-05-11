// App-level PIN gate. Запускається на кожен запит що не виключений.
//
// Логіка:
//   1. Якщо нема env SALON_PIN → пропускаємо все (для dev/онбордингу: апка
//      працює як раніше, без gate-а).
//   2. Bypass-шляхи (у коді нижче) — теж пропускаємо без перевірки.
//   3. Інакше — перевіряємо cookie `salon_session`:
//      - валідна → пропускаємо
//      - невалідна, шлях під /api/* → 401 JSON (не редірект, інакше POST
//        ішов би у GET /login → 405 і фронт ламався з cryptic JSON-parse)
//      - невалідна, сторінка → редірект на /login з ?next= для повернення.

import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth-session";

const BYPASS_PREFIXES = [
  "/login",
  "/api/auth", // login/logout
  "/api/health", // healthcheck
  "/api/report", // публічні звіти ЗП
  "/report/master", // публічні сторінки звітів
  "/preview", // Airtable embed-preview
  "/_next/", // Next.js assets (на додачу до matcher-фільтра)
];

const BYPASS_EXACT = new Set([
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.json",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
]);

function isBypassed(pathname: string): boolean {
  if (BYPASS_EXACT.has(pathname)) return true;
  return BYPASS_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isBypassed(pathname)) return NextResponse.next();

  const expectedPin = process.env.SALON_PIN;
  if (!expectedPin) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  try {
    valid = await verifySessionToken(token);
  } catch {
    valid = false;
  }
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  const returnTo = pathname + search;
  if (returnTo && returnTo !== "/") {
    loginUrl.searchParams.set("next", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
