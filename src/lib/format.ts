import type { Settings } from "@/app/api/settings/route";

/* ─── Currency ─── */

// Locale is kept constant (uk-UA) for thousands/decimal separators.
// Currency varies per tenant (UAH / USD / EUR / PLN); Intl picks the symbol.
const NUMBER_LOCALE = "uk-UA";
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
  opts?: { signed?: boolean; maximumFractionDigits?: number },
): string {
  const { signed = false, maximumFractionDigits = 0 } = opts ?? {};
  const symbol = currencySymbol(currency);
  const abs = Math.abs(amount).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits });
  if (amount < 0) return `−${abs} ${symbol}`;
  if (signed && amount > 0) return `+${abs} ${symbol}`;
  return `${abs} ${symbol}`;
}
