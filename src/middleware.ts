// App-level PIN gate. Запускається на КОЖЕН запит, що не виключений матчером.
//
// Логіка:
//   1. Якщо нема env SALON_PIN → пропускаємо все (для dev/онбордингу: апка
//      працює як раніше). Сигнал — у Vercel env vars не заповнено → нема gate-а.
//   2. Якщо є SALON_PIN → перевіряємо cookie `salon_session`.
//      - Невалідна або відсутня → редірект на /login (з ?next=… для return-after-login).
//      - Валідна → пропускаємо.
//
// Винятки (матчер у `config.matcher` нижче):
//   - /login                — сама сторінка логіну
//   - /api/auth/*           — login/logout API
//   - /report/master/*      — публічні звіти ЗП для майстрів (вони в Telegram)
//   - /api/report/*         — API публічних звітів (звіт сам дані тягне)
//   - /preview/*            — preview-сторінки (Airtable embeds, теж публічні)
//   - /api/health           — healthcheck для Vercel
//   - /_next/*, /favicon... — асети, оминаємо через matcher

import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth-session";

export async function middleware(request: NextRequest) {
  // PIN не налаштований → апка відкрита (як було до додавання gate-а).
  // Це дозволяє локальному dev-у і свіжому Vercel-проекту працювати без зайвих
  // кроків — gate активується одночасно з SALON_PIN.
  const expectedPin = process.env.SALON_PIN;
  if (!expectedPin) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const valid = await verifySessionToken(token);
  if (valid) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  // Зберігаємо звідки користувач прийшов щоб після логіну повернути назад.
  const returnTo = request.nextUrl.pathname + request.nextUrl.search;
  if (returnTo && returnTo !== "/") {
    loginUrl.searchParams.set("next", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Все під захист, крім перерахованого. Asset-и (`_next/static`,
  // `_next/image`, favicon тощо) виключаємо через negative-lookahead.
  matcher: [
    "/((?!login|api/auth|api/health|report/master|api/report|preview|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|robots.txt|sitemap.xml).*)",
  ],
};
