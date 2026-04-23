/**
 * Unit-тести `activeSharesOn` — резолюція активної ревізії розподілу прибутку.
 *
 * Чому окремий файл, а не в route-файлі: функція експортована з
 * /api/specialists/route.ts — імпортуємо як public API. Якщо згодом винесеш
 * її в lib/ownership.ts — імпорт поправиться, тести не поміняються.
 *
 * Регресії, які цей файл охороняє:
 *   1) 170%-баг від 2026-04-23: три ревізії на одну дату → сума > 100%.
 *      Фікс: tie-break по createdTime + вікно групування 60с.
 *   2) Майбутня-дата: ревізія з date > target не повинна діяти.
 *   3) Порожній масив / усі ревізії в майбутньому → null.
 */
import { describe, it, expect } from "vitest";
import { activeSharesOn, type OwnershipRevisionRow } from "./ownership";

type Row = OwnershipRevisionRow;

function row(date: string, specialistId: string, sharePct: number, createdTime: string): Row {
  return { date, specialistId, sharePct, createdTime };
}

/** Сортуємо asc по (date, createdTime) — контракт loadOwnershipRevisions. */
function sorted(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdTime.localeCompare(b.createdTime);
  });
}

describe("activeSharesOn — порожній стан", () => {
  it("empty revisions → null", () => {
    expect(activeSharesOn([], "2026-04-23")).toBeNull();
  });

  it("всі ревізії в майбутньому → null", () => {
    const revs = sorted([row("2026-05-01", "recA", 100, "2026-05-01T10:00:00.000Z")]);
    expect(activeSharesOn(revs, "2026-04-23")).toBeNull();
  });
});

describe("activeSharesOn — проста ревізія", () => {
  it("одна ревізія з одним власником = 100%", () => {
    const revs = sorted([row("2026-01-01", "recA", 100, "2026-01-01T10:00:00.000Z")]);
    const result = activeSharesOn(revs, "2026-04-23");
    expect(result).not.toBeNull();
    expect(result!.get("recA")).toBe(100);
    expect(result!.size).toBe(1);
  });

  it("ревізія з двома власниками 70/30", () => {
    const revs = sorted([
      row("2026-01-01", "recA", 70, "2026-01-01T10:00:00.000Z"),
      row("2026-01-01", "recB", 30, "2026-01-01T10:00:00.500Z"),
    ]);
    const result = activeSharesOn(revs, "2026-04-23");
    expect(result!.get("recA")).toBe(70);
    expect(result!.get("recB")).toBe(30);
  });
});

describe("activeSharesOn — колізія однакових дат (170%-баг)", () => {
  /**
   * Репродукція реального інциденту: адмін створив ревізію 100%, потім
   * одразу ж другу на ту саму дату (70/30). Без tie-break по createdTime
   * activeSharesOn сумує ВСЕ і повертає 170%.
   */
  it("дві ревізії на одну дату: активна тільки пізніша (за createdTime)", () => {
    const revs = sorted([
      // Стара «Початковий стан» — 100%
      row("2026-04-23", "recA", 100, "2026-04-23T09:00:00.000Z"),
      // Нова ревізія 70/30 через годину
      row("2026-04-23", "recA", 70, "2026-04-23T10:00:00.000Z"),
      row("2026-04-23", "recB", 30, "2026-04-23T10:00:00.500Z"),
    ]);
    const result = activeSharesOn(revs, "2026-04-23");
    expect(result!.get("recA")).toBe(70);
    expect(result!.get("recB")).toBe(30);
    // Стара 100% НЕ додається — інакше recA отримав би 170.
    const total = [...result!.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("три ревізії на одну дату: активна тільки найсвіжіша", () => {
    const revs = sorted([
      row("2026-04-23", "recA", 100, "2026-04-23T08:00:00.000Z"),
      row("2026-04-23", "recA", 50, "2026-04-23T09:00:00.000Z"),
      row("2026-04-23", "recB", 50, "2026-04-23T09:00:00.100Z"),
      row("2026-04-23", "recA", 60, "2026-04-23T10:00:00.000Z"),
      row("2026-04-23", "recB", 40, "2026-04-23T10:00:00.100Z"),
    ]);
    const result = activeSharesOn(revs, "2026-04-23");
    expect(result!.get("recA")).toBe(60);
    expect(result!.get("recB")).toBe(40);
    const total = [...result!.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("рядки в межах 60с одного batch зливаються в ОДНУ ревізію", () => {
    // Airtable batch-create з 3 власниками: createdTime розкидано в межах 500мс.
    const revs = sorted([
      row("2026-04-23", "recA", 50, "2026-04-23T10:00:00.000Z"),
      row("2026-04-23", "recB", 30, "2026-04-23T10:00:00.200Z"),
      row("2026-04-23", "recC", 20, "2026-04-23T10:00:00.500Z"),
    ]);
    const result = activeSharesOn(revs, "2026-04-23");
    expect(result!.get("recA")).toBe(50);
    expect(result!.get("recB")).toBe(30);
    expect(result!.get("recC")).toBe(20);
  });
});

describe("activeSharesOn — історія", () => {
  it("target до нової ревізії → використовується стара", () => {
    const revs = sorted([
      row("2026-01-01", "recA", 100, "2026-01-01T10:00:00.000Z"),
      row("2026-04-23", "recA", 70, "2026-04-23T10:00:00.000Z"),
      row("2026-04-23", "recB", 30, "2026-04-23T10:00:00.100Z"),
    ]);
    // 2026-03-01 — ще діє стара ревізія
    const march = activeSharesOn(revs, "2026-03-01");
    expect(march!.get("recA")).toBe(100);
    expect(march!.has("recB")).toBe(false);

    // 2026-04-23 — діє нова
    const april = activeSharesOn(revs, "2026-04-23");
    expect(april!.get("recA")).toBe(70);
    expect(april!.get("recB")).toBe(30);
  });

  it("ревізія в точну дату target діє (включно)", () => {
    const revs = sorted([row("2026-04-23", "recA", 100, "2026-04-23T10:00:00.000Z")]);
    expect(activeSharesOn(revs, "2026-04-23")!.get("recA")).toBe(100);
  });
});
