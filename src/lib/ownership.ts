/**
 * Pure helpers для ревізій розподілу прибутку (append-only model).
 *
 * Чому не в route.ts: (а) pure-функція без Next deps — тестуємо без моків,
 * (б) міграція на Postgres триває файл майже 1:1, (в) інші роути можуть
 * імпортувати без циклу через /api/specialists.
 *
 * Model recap:
 *   - Кожен рядок Airtable = (date, specialistId, sharePct). Одна ревізія —
 *     група рядків з однаковою датою, що створені одним batch (createdTime
 *     близько один до одного). Сума часток в ревізії = 100%.
 *   - Активна ревізія на дату X: rows з max(date, createdTime) серед тих,
 *     де r.date ≤ X. Tie-breaker по createdTime захищає від колізії, коли
 *     кілька ревізій створено на ту ж саму дату (баг 2026-04-23 «170%»).
 */

export interface OwnershipRevisionRow {
  date: string; // YYYY-MM-DD
  specialistId: string;
  sharePct: number;
  /** Airtable createdTime — tie-breaker коли кілька ревізій на одну дату. */
  createdTime: string;
}

/**
 * Група ревізії = набір рядків одного batch-create. Ширина вікна — 60с.
 * Узгоджує навіть повільний мережевий batch і не зливає два різні сеанси,
 * які ненароком створили ревізії в одну хвилину (можна — побачить user).
 */
export const REVISION_GROUP_WINDOW_MS = 60_000;

/**
 * Повертає активний розподіл часток на дату `date`.
 *
 * Алгоритм (фікс 2026-04-23):
 *   1. Серед рядків з r.date ≤ target знайти anchor — максимум за
 *      (date, createdTime).
 *   2. Активна група = рядки з anchor.date ∩ createdTime в межах
 *      [anchor.createdTime − 60с; anchor.createdTime].
 *   3. Сумуємо частки всередині групи (можна кілька рядків одного
 *      спеціаліста в одній ревізії).
 *
 * Повертає null якщо ревізій немає АБО всі старші за target. Caller
 * робить fallback (єдиний власник = 100%, або ділимо серед isOwner=true).
 *
 * ВХІДНИЙ КОНТРАКТ: revisions посортовані asc по (date, createdTime).
 */
export function activeSharesOn(
  revisions: OwnershipRevisionRow[],
  date: string,
): Map<string, number> | null {
  if (revisions.length === 0) return null;

  let anchor: OwnershipRevisionRow | null = null;
  for (const r of revisions) {
    if (r.date > date) break; // asc-sort — далі тільки більші дати
    if (
      !anchor ||
      r.date > anchor.date ||
      (r.date === anchor.date && r.createdTime > anchor.createdTime)
    ) {
      anchor = r;
    }
  }
  if (!anchor) return null;

  const anchorMs = Date.parse(anchor.createdTime);
  const result = new Map<string, number>();
  for (const r of revisions) {
    if (r.date !== anchor.date) continue;
    const ms = Date.parse(r.createdTime);
    if (anchorMs - ms > REVISION_GROUP_WINDOW_MS) continue; // стара ревізія на цю ж дату
    if (ms > anchorMs) continue; // захист від випадків коли якось маємо >anchor
    result.set(r.specialistId, (result.get(r.specialistId) || 0) + r.sharePct);
  }
  return result;
}
