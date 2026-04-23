/**
 * Unit-tests для pricing.ts. Формули раніше жили в Airtable як formula-
 * fields; перед міграцією на код я звірив 15 реальних записів golden-
 * file-ом (results збіглись 1:1). Цей файл — синтетичні сценарії, які
 * покривають кожну гілку формул. Вони охороняють код від регресій коли
 * Airtable вже не буде.
 *
 * Запуск: npx vitest run src/lib/pricing.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  totalWorkCost,
  totalMaterialsCost,
  totalServicePrice,
  salonShareForService,
  masterPayForService,
  masterPayForMaterials,
  salonShareForMaterials,
  incomeMaterials,
  totalSalePrice,
  incomeSales,
  totalSalonIncome,
  netSalonForRow,
  masterPayTotal,
  masterAccrual,
  catalogServicePrice,
  materialUsageCost,
  defaultSalonPctForService,
  type MasterContext,
  type ServiceRowInputs,
} from "./pricing";

/** Zero-row factory — починаємо з нулів, кожен тест перекриває те, що йому треба. */
function row(overrides: Partial<ServiceRowInputs> = {}): ServiceRowInputs {
  return {
    fixedPrice: 0,
    fixedHourlyRate: 0,
    hours: 0,
    extraHours: 0,
    addonServicePrice: 0,
    fixedMaterialsCost: 0,
    extraMaterialsCalc: 0,
    extraMaterialsCalcRollup: 0,
    fixedSalePrice: 0,
    fixedCostPrice: 0,
    fixedMasterPctForSale: 0,
    addonSalePrice: 0,
    fixedMasterPayForService: 0,
    materialsPurchaseCost: 0,
    fixedMaterialsCostPrice: 0,
    expenseAmount: 0,
    debtAmount: 0,
    ...overrides,
  };
}

const commission30: MasterContext = {
  type: "commission",
  salonPctForService: 30,
  masterPctForMaterials: 0,
};
const commission50mat10: MasterContext = {
  type: "commission",
  salonPctForService: 50,
  masterPctForMaterials: 10,
};
const hourly100: MasterContext = {
  type: "hourly",
  salonPctForService: 100,
  masterPctForMaterials: 0,
};
const rental100: MasterContext = {
  type: "rental",
  salonPctForService: 100,
  masterPctForMaterials: 0,
};
const salary100: MasterContext = {
  type: "salary",
  salonPctForService: 100,
  masterPctForMaterials: 0,
};

describe("totalWorkCost (TWC)", () => {
  it("fixedPrice has priority over hourly when > 0", () => {
    expect(
      totalWorkCost({ fixedPrice: 500, fixedHourlyRate: 200, hours: 3, extraHours: 1, addonServicePrice: 0 }),
    ).toBe(500);
  });
  it("falls back to hourly rate × (hours + extraHours) when fixedPrice=0", () => {
    expect(
      totalWorkCost({ fixedPrice: 0, fixedHourlyRate: 200, hours: 3, extraHours: 1, addonServicePrice: 0 }),
    ).toBe(800);
  });
  it("adds addonServicePrice in both branches", () => {
    expect(
      totalWorkCost({ fixedPrice: 500, fixedHourlyRate: 0, hours: 0, extraHours: 0, addonServicePrice: 150 }),
    ).toBe(650);
    expect(
      totalWorkCost({ fixedPrice: 0, fixedHourlyRate: 100, hours: 2, extraHours: 0, addonServicePrice: 50 }),
    ).toBe(250);
  });
});

describe("totalMaterialsCost (TMC)", () => {
  it("sums fixed + extraCalc + rollup", () => {
    expect(
      totalMaterialsCost({ fixedMaterialsCost: 100, extraMaterialsCalc: 20, extraMaterialsCalcRollup: 30 }),
    ).toBe(150);
  });
});

describe("totalServicePrice (TSP)", () => {
  it("TWC + TMC", () => {
    expect(totalServicePrice(row({ fixedPrice: 500, fixedMaterialsCost: 100 }))).toBe(600);
  });
});

describe("salonShareForService — commission branch", () => {
  it("(TSP − TMC) × salonPct / 100", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200 });
    // work = 1000, salon 30% = 300
    expect(salonShareForService(r, commission30)).toBe(300);
  });
  it("FM=0 on salary/hourly still respects salonPct=100", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200 });
    expect(salonShareForService(r, hourly100)).toBe(1000);
  });
});

describe("salonShareForService — FM branch (IF(FM, ...))", () => {
  it("FM > 0 overrides pct: salon = (TSP−TMC) − FM", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPayForService: 400 });
    // work = 1000, master = 400, salon = 600. Pct ignored.
    expect(salonShareForService(r, commission30)).toBe(600);
    expect(salonShareForService(r, hourly100)).toBe(600);
  });
  it("FM=0 is falsy → goes to pct branch", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPayForService: 0 });
    expect(salonShareForService(r, commission30)).toBe(300); // 1000 * 0.30
  });
});

describe("masterPayForService", () => {
  it("commission complement of salon share", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200 });
    expect(masterPayForService(r, commission30)).toBe(700); // 1000 − 300
  });
  it("FM branch returns FM exactly", () => {
    const r = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPayForService: 400 });
    expect(masterPayForService(r, commission30)).toBe(400);
  });
});

describe("masterPayForMaterials + salonShareForMaterials", () => {
  it("split by masterPctForMaterials", () => {
    const r = row({ fixedMaterialsCost: 200 });
    expect(masterPayForMaterials(r, commission50mat10)).toBeCloseTo(20);
    expect(salonShareForMaterials(r, commission50mat10)).toBeCloseTo(180);
  });
});

describe("incomeMaterials", () => {
  it("TMC − purchaseCost − fixedMatCostPrice − masterMatPay", () => {
    const r = row({
      fixedMaterialsCost: 200,
      materialsPurchaseCost: 50,
      fixedMaterialsCostPrice: 30,
    });
    // TMC=200, 200 − 50 − 30 − 20(master 10%) = 100
    expect(incomeMaterials(r, commission50mat10)).toBeCloseTo(100);
  });
});

describe("totalSalePrice + incomeSales", () => {
  it("TSalePrice = addon + fixed", () => {
    expect(totalSalePrice({ addonSalePrice: 50, fixedSalePrice: 200, fixedCostPrice: 0, fixedMasterPctForSale: 0 })).toBe(250);
  });
  it("incomeSales = fixedSalePrice − fixedCostPrice − masterPctSale", () => {
    expect(
      incomeSales({ addonSalePrice: 0, fixedSalePrice: 200, fixedCostPrice: 120, fixedMasterPctForSale: 20 }),
    ).toBe(60);
  });
});

describe("totalSalonIncome + netSalonForRow", () => {
  it("sums service + materials + sales shares; subtracts expenses", () => {
    const r = row({
      fixedPrice: 1000,
      fixedMaterialsCost: 200,
      materialsPurchaseCost: 50,
      fixedMaterialsCostPrice: 30,
      fixedSalePrice: 200,
      fixedCostPrice: 120,
      fixedMasterPctForSale: 20,
      expenseAmount: 0,
    });
    // salonService = (1200−200)*0.5 = 500
    // incomeMat = 200 − 50 − 30 − 20 = 100
    // incomeSales = 200 − 120 − 20 = 60
    // total = 660
    expect(totalSalonIncome(r, commission50mat10)).toBeCloseTo(660);
    expect(netSalonForRow(r, commission50mat10)).toBeCloseTo(660);

    const withExpense = row({ ...r, expenseAmount: 100 });
    expect(netSalonForRow(withExpense, commission50mat10)).toBeCloseTo(560);
  });
});

describe("masterPayTotal — Variant A: unified formula", () => {
  /**
   * Після Variant A (2026-04) masterPayTotal = masterPayForService + matPart + salePart
   * для ВСІХ типів. Гілка FM vs pct інкапсульована в `salonShareForService`.
   * Типи відрізняються лише default-значеннями на картці, а не формулою.
   */
  const base = row({
    fixedPrice: 1000,
    fixedMaterialsCost: 200,
    fixedMasterPayForService: 300,
    fixedMasterPctForSale: 50,
  });
  it("hourly з FM=300: masterPayForService=FM=300 + mat=0 + sale=50 = 350", () => {
    expect(masterPayTotal(base, hourly100)).toBe(350);
  });
  it("rental з FM=300: теж 350 (FM-гілка працює для всіх типів)", () => {
    expect(masterPayTotal(base, rental100)).toBe(350);
  });
  it("salary з FM=300: теж 350", () => {
    expect(masterPayTotal(base, salary100)).toBe(350);
  });
  it("salary з FM=0 і salonPct=100: masterPayForService=0 → тільки mat+sale", () => {
    const noFM = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPctForSale: 50 });
    expect(masterPayTotal(noFM, salary100)).toBe(50);
  });
  it("salary з FM=0 і salonPct=70 (адмін-бонус за власні послуги)", () => {
    // Це кейс баги, яку чиним: salary-адмін виконує послугу, має отримати 30%
    const salaryBonus: MasterContext = {
      type: "salary",
      salonPctForService: 70,
      masterPctForMaterials: 0,
    };
    const noFM = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPctForSale: 50 });
    // work=1000, masterPayForService = 1000*(1-0.7) = 300; + 50 = 350
    expect(masterPayTotal(noFM, salaryBonus)).toBeCloseTo(350);
  });
  it("commission з FM=300: masterPayForService=300 + sale=50 = 350", () => {
    expect(masterPayTotal(base, commission30)).toBe(350);
  });
  it("commission без FM: masterPayForService=700 + sale=50 = 750", () => {
    const noFM = row({ fixedPrice: 1000, fixedMaterialsCost: 200, fixedMasterPctForSale: 50 });
    expect(masterPayTotal(noFM, commission30)).toBeCloseTo(750);
  });
});

describe("masterAccrual", () => {
  it("= masterPayTotal + debtAmount (signed)", () => {
    const r = row({ fixedPrice: 1000, fixedMasterPctForSale: 50, debtAmount: -400 });
    // commission: masterPayService = 1000*0.7=700; + 50 = 750; + (-400) = 350
    expect(masterAccrual(r, commission30)).toBe(350);
  });
});

describe("catalogServicePrice", () => {
  it("workPrice × hours + materialsCost", () => {
    expect(catalogServicePrice({ workPrice: 200, hours: 1.5, materialsCost: 50 })).toBe(350);
  });
});

describe("materialUsageCost", () => {
  it("proportional: used × packageCost / packageTotal", () => {
    expect(materialUsageCost({ usedAmount: 5, packageCost: 100, packageTotalAmount: 50 })).toBe(10);
  });
  it("returns 0 when packageTotal=0 (division safety)", () => {
    expect(materialUsageCost({ usedAmount: 5, packageCost: 100, packageTotalAmount: 0 })).toBe(0);
  });
});

describe("defaultSalonPctForService (salary-bug guard)", () => {
  it("commission → commissionValue from form", () => {
    expect(defaultSalonPctForService("commission", 30)).toBe(30);
    expect(defaultSalonPctForService("commission", 45)).toBe(45);
  });
  it("rental/salary/hourly → always 100 (NOT 0)", () => {
    expect(defaultSalonPctForService("rental", 30)).toBe(100);
    expect(defaultSalonPctForService("salary", 30)).toBe(100);
    expect(defaultSalonPctForService("hourly", 30)).toBe(100);
    // commissionValue ignored for non-commission
    expect(defaultSalonPctForService("salary", 0)).toBe(100);
  });
});
