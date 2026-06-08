import { describe, it, expect } from "vitest";
import {
  isAccrualComment,
  paymentBucket,
  cashDeltaForServiceRow,
  cashDeltaForPurchase,
  cashDeltaForEntry,
} from "./cash";
import { SERVICE_FIELDS } from "./airtable-fields";
import type { RowMetrics } from "./service-row";
import type { JournalEntry } from "./types";

// Мінімальний RowMetrics — у касі релевантні лише totalServicePrice/totalSalePrice.
function metrics(svc: number, sale = 0): RowMetrics {
  return {
    totalWorkCost: 0,
    totalMaterialsCost: 0,
    totalServicePrice: svc,
    salonShareForService: 0,
    masterPayForService: 0,
    masterPayForMaterials: 0,
    salonShareForMaterials: 0,
    incomeMaterials: 0,
    materialsCogs: 0,
    totalSalePrice: sale,
    incomeSales: 0,
    totalSalonIncome: 0,
    netSalon: 0,
    masterPayTotal: 0,
    masterAccrual: 0,
  };
}

function row(fields: Record<string, unknown>): Record<string, unknown> {
  return fields;
}

describe("isAccrualComment — єдиний детект нарахування", () => {
  it("ловить незалежно від регістру і пробілів", () => {
    expect(isAccrualComment("Нарахування ЗП")).toBe(true);
    expect(isAccrualComment("нарахування зп")).toBe(true);
    expect(isAccrualComment("  Нарахування за день  ")).toBe(true);
  });
  it("не плутає звичайні коментарі", () => {
    expect(isAccrualComment("Виплата ЗП")).toBe(false);
    expect(isAccrualComment("Вилучення прибутку")).toBe(false);
    expect(isAccrualComment("")).toBe(false);
    expect(isAccrualComment(undefined)).toBe(false);
    expect(isAccrualComment(null)).toBe(false);
  });
});

describe("paymentBucket", () => {
  it("мапить каси", () => {
    expect(paymentBucket("готівка")).toBe("cash");
    expect(paymentBucket("карта")).toBe("card");
    expect(paymentBucket(undefined)).toBe("unknown");
    expect(paymentBucket("")).toBe("unknown");
  });
});

describe("cashDeltaForServiceRow", () => {
  it("виручка = totalServicePrice + totalSalePrice (+ у касу)", () => {
    expect(cashDeltaForServiceRow(row({}), metrics(1000, 200))).toBe(1200);
  });
  it("витрата → відтік (−|сума|)", () => {
    expect(cashDeltaForServiceRow(row({ [SERVICE_FIELDS.expenseAmount]: 500 }), metrics(0))).toBe(-500);
  });
  it("виплата майстру (debt<0) → відтік", () => {
    expect(cashDeltaForServiceRow(row({ [SERVICE_FIELDS.debtAmount]: -800 }), metrics(0))).toBe(-800);
  });
  it("довнесення/повернення (debt>0, не нарахування) → приток", () => {
    expect(cashDeltaForServiceRow(row({ [SERVICE_FIELDS.debtAmount]: 49.73 }), metrics(0))).toBe(49.73);
  });
  it("нарахування ЗП (debt>0 + коментар) → 0 (liability, не рух каси)", () => {
    expect(
      cashDeltaForServiceRow(
        row({ [SERVICE_FIELDS.debtAmount]: 1500, [SERVICE_FIELDS.comments]: "Нарахування за день" }),
        metrics(0),
      ),
    ).toBe(0);
    // регістронезалежно — раніше клієнт це проґавлював
    expect(
      cashDeltaForServiceRow(
        row({ [SERVICE_FIELDS.debtAmount]: 1500, [SERVICE_FIELDS.comments]: "нарахування зп" }),
        metrics(0),
      ),
    ).toBe(0);
  });
});

describe("cashDeltaForPurchase", () => {
  it("закупка → відтік незалежно від знака вводу", () => {
    expect(cashDeltaForPurchase(1387)).toBe(-1387);
    expect(cashDeltaForPurchase(-1387)).toBe(-1387);
    expect(cashDeltaForPurchase(0)).toBe(0);
  });
});

describe("cashDeltaForEntry — клієнтський бік (JournalEntry)", () => {
  const base: Partial<JournalEntry> = { id: "x", date: "2026-06-07", title: "" };
  it("послуга = сума share-полів", () => {
    const e = { ...base, type: "service", amount: 900, salonShare: 270, specialistServiceShare: 630, salonMaterialShare: 50, specialistMaterialShare: 5 } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(955);
  });
  it("продаж = sales-share поля", () => {
    const e = { ...base, type: "sale", amount: 835, salonSalesShare: 668, specialistSalesShare: 167 } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(835);
  });
  it("витрата → −|amount|", () => {
    const e = { ...base, type: "expense", amount: -1300 } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(-1300);
  });
  it("закупка → −|amount| (amount у журналі вже від'ємний)", () => {
    const e = { ...base, type: "purchase", amount: -1387 } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(-1387);
  });
  it("нарахування ЗП → 0", () => {
    const e = { ...base, type: "debt", amount: 1500, comment: "Нарахування за день" } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(0);
  });
  it("виплата майстру → signed", () => {
    const e = { ...base, type: "debt", amount: -4104.7, comment: "Виплата" } as JournalEntry;
    expect(cashDeltaForEntry(e)).toBe(-4104.7);
  });
});
