import type { Settings } from "@/app/api/settings/route";

/* ─── Locale ─── */

/**
 * Derive number-formatting locale from the tenant's IANA timezone.
 * One setting (timezone) controls both time display and thousands separators.
 * UA: "1 234", IE: "1,234", IT: "1.234", PL: "1 234".
 */
const LOCALE_BY_TZ: Record<string, string> = {
  "Europe/Kyiv": "uk-UA",
  "Europe/Dublin": "en-IE",
  "Europe/Rome": "it-IT",
  "Europe/Warsaw": "pl-PL",
};

export function localeFromTimezone(tz: string | undefined): string {
  if (!tz) return "uk-UA";
  return LOCALE_BY_TZ[tz] ?? "uk-UA";
}

/* ─── Currency ─── */

const SYMBOLS: Record<Settings["currency"], string> = {
  UAH: "₴",
  USD: "$",
  EUR: "€",
  PLN: "zł",
};

export function currencySymbol(currency: Settings["currency"] | undefined): string {
  return SYMBOLS[currency ?? "UAH"];
}

/**
 * Format a money amount: `1 234 ₴`, `−200 $`, `0 €`.
 * Sign handling is consistent across locales (always leading "−" for negatives).
 *
 * Avoids Intl's currency style because it injects non-breaking spaces and
 * per-locale quirks (e.g. "UAH" code instead of "₴" in some contexts).
 */
export function formatMoney(
  amount: number,
  currency: Settings["currency"] | undefined = "UAH",
  opts?: { signed?: boolean; maximumFractionDigits?: number; locale?: string },
): string {
  const { signed = false, maximumFractionDigits = 0, locale = "uk-UA" } = opts ?? {};
  const symbol = currencySymbol(currency);
  const abs = Math.abs(amount).toLocaleString(locale, { maximumFractionDigits });
  if (amount < 0) return `−${abs} ${symbol}`;
  if (signed && amount > 0) return `+${abs} ${symbol}`;
  return `${abs} ${symbol}`;
}

/**
 * Curried helper — bind a Settings object once, then format many amounts.
 * Usage in a component:
 *   const fmt = moneyFormatter(settings);
 *   <span>{fmt(1234)}</span>                   // "1 234 ₴"
 *   <span>{fmt(-200)}</span>                   // "−200 ₴"
 *   <span>{fmt(500, { signed: true })}</span>  // "+500 ₴"
 */
export function moneyFormatter(
  settings: Settings | null | undefined,
): (amount: number, opts?: { signed?: boolean; maximumFractionDigits?: number }) => string {
  const currency = settings?.currency;
  const locale = localeFromTimezone(settings?.timezone);
  return (amount, opts) => formatMoney(amount, currency, { ...opts, locale });
}
