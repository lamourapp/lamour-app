/**
 * Pricing / бухгалтерські формули — єдина точка правди.
 *
 * Мета: відв'язати бізнес-логіку від Airtable formula-fields. Код нижче —
 * 1:1 копія формул, що зараз живуть у Airtable (витягнуті через MCP
 * get_table_schema, а не відтворені по пам'яті). При міграції на Postgres
 * цей файл залишається, formula-поля в Airtable стають зайвими.
 *
 * ВАЖЛИВО: функції тут — чисті (pure). На вхід — сирі числа, на вихід —
 * число. Це дозволяє юніт-тести та golden-file перевірку проти реальних
 * Airtable-записів.
 *
 * ─── Ієрархія формул (дерево залежностей) ─────────────────────────────
 *
 *   totalWorkCost (TWC) ← fixedPrice | fixedHourlyRate × (hours + extraHours) + addonServicePrice
 *   totalMaterialsCost (TMC) ← fixedMaterialsCost + extraMaterialsCalc + extraMaterialsCalcRollup
 *   totalServicePrice (TSP) = TWC + TMC
 *
 *   salonShareForService = IF(FM, (TSP−TMC)−FM, (TSP−TMC) × salonPct/100)
 *   masterPayForService  = TSP − TMC − salonShareForService
 *   masterPayForMaterials = TMC × masterMatPct / 100
 *   salonShareForMaterials = TMC − masterPayForMaterials
 *
 *   totalSalePrice = addonSalePrice + fixedSalePrice
 *   incomeMaterials = TMC − purchaseCostRollup − fixedMaterialsCostPrice − masterPayForMaterials
 *   incomeSales = fixedSalePrice − fixedCostPrice − fixedMasterPctForSale
 *
 *   totalSalonIncome = salonShareForService + incomeMaterials + incomeSales
 *   netSalon = totalSalonIncome − expenseAmount
 *
 *   masterPayTotal = masterPayForService + masterPayForMaterials + fixedMasterPctForSale
 *     — єдина формула для всіх типів оплати. Розбіжність між типами
 *     схована в `salonShareForService`: FM-гілка (hourly), 100%-гілка
 *     (salary/rental за замовчуванням → masterPayForService = 0),
 *     commission-гілка (за налаштованим %). Це дозволяє: (а) майстру-
 *     адміну з salary але з service% < 100 отримати бонус за послугу,
 *     (б) уніфікувати UI картки (одне поле «% салону за послугу» для всіх).
 *
 *   masterAccrual = masterPayTotal + debtAmount   (Airtable: «Нарахування майстру»)
 *   masterBalance = SUM(masterAccrual) по всіх записах майстра (Airtable rollup)
 *
 * ─── Розбіжність з `computeBalances` ───────────────────────────────────
 *
 * Airtable `Баланс` = простий rollup SUM(Нарахування майстру). Він НЕ
 * враховує:
 *   1) Розподіл борг-рядків між master-pool / owner-pool для майстра-власника
 *      (роутінг за ключовим словом у коментарі).
 *   2) Snapshot-ставки на момент запису (якщо % на картці змінився).
 *   3) Віртуальний balance власника (netSalon × частка − вилучення).
 *
 * Тобто `computeBalances` у /api/specialists/route.ts — це *надбудова*
 * над Airtable `Нарахування майстру`, яка працює з сирими даними. При
 * міграції на Postgres rollup зникає, залишиться тільки computeBalances.
 */

/* ─── Типи ───────────────────────────────────────────────────────── */

/** Labels як вони записані в Airtable-select «Тип оплати». */
export const COMPENSATION_LABEL = {
  commission: "комісія",
  hourly: "погодинна",
  salary: "зарплата",
  rental: "оренда",
} as const;

export type CompensationType = keyof typeof COMPENSATION_LABEL;

/** Контекст майстра на момент запису (snapshot або live). */
export interface MasterContext {
  /** Тип оплати. Визначає гілку розрахунку masterPayTotal. */
  type: CompensationType;
  /** `% cалону за послугу` (картка майстра). Ігнорується якщо FM>0. */
  salonPctForService: number;
  /** `% майстру за матеріали(відсоток)` (lookup з картки на журнал). */
  masterPctForMaterials: number;
}

/** Сирі числа для TWC (Загальна вартість роботи). */
export interface WorkCostInputs {
  /** Фіксована вартість послуги (якщо 0 — вмикається погодинний розрахунок). */
  fixedPrice: number;
  /** Фікс. вартість години (snapshot з послуги/майстра). */
  fixedHourlyRate: number;
  /** К-сть годин (lookup з каталогу послуг). */
  hours: number;
  /** Додаткові години (ручний ввід майстра). */
  extraHours: number;
  /** Доповнення — окрема сума, яка додається до роботи. */
  addonServicePrice: number;
}

/** Сирі числа для TMC (Загальна вартість матеріалів). */
export interface MaterialsCostInputs {
  /** Фікс. вартість матеріалів (API-snapshot з послуги). */
  fixedMaterialsCost: number;
  /** Додаткові матеріали(Калькуляція) — ручний ввід у грн. */
  extraMaterialsCalc: number;
  /** Додаткові матеріали(Калькуляція) new — rollup SUM(Замовлення.До оплати). */
  extraMaterialsCalcRollup: number;
}

/** Сирі числа для продажу товарів. */
export interface SaleInputs {
  /** Фікс. ціна продажу (API-sum по Продажі деталі). */
  fixedSalePrice: number;
  /** Фікс. ціна закупки (API-sum по Продажі деталі). */
  fixedCostPrice: number;
  /** Фікс. % майстру за продаж (API-calculated, в грн). */
  fixedMasterPctForSale: number;
  /** Доповнення(продажі). */
  addonSalePrice: number;
}

/** Повний набір сирих входів одного рядка журналу. */
export interface ServiceRowInputs extends WorkCostInputs, MaterialsCostInputs, SaleInputs {
  /** Фікс. оплата майстру за послугу (FM). 0 → commission-гілка. */
  fixedMasterPayForService: number;
  /** Сирий rollup SUM(Послуга.закупка) — собівартість матеріалів з послуги. */
  materialsPurchaseCost: number;
  /** Фікс. собівартість матеріалів (API-snapshot). */
  fixedMaterialsCostPrice: number;
  /** Сума витрат (рядок типу «витрата»). */
  expenseAmount: number;
  /** Сума боргу. +(ми винні), −(нам винні). */
  debtAmount: number;
}

/* ─── Per-row formulas (1:1 із Airtable) ──────────────────────────── */

/** TWC — Загальна вартість роботи. */
export function totalWorkCost(row: WorkCostInputs): number {
  const base =
    row.fixedPrice > 0
      ? row.fixedPrice
      : row.fixedHourlyRate * (row.hours + row.extraHours);
  return base + row.addonServicePrice;
}

/** TMC — Загальна вартість матеріалів. */
export function totalMaterialsCost(row: MaterialsCostInputs): number {
  return row.fixedMaterialsCost + row.extraMaterialsCalc + row.extraMaterialsCalcRollup;
}

/** TSP — Всього вартість послуги. */
export function totalServicePrice(row: WorkCostInputs & MaterialsCostInputs): number {
  return totalWorkCost(row) + totalMaterialsCost(row);
}

/** Салону за послугу. */
export function salonShareForService(row: ServiceRowInputs, master: MasterContext): number {
  const workMinusMaterials = totalServicePrice(row) - totalMaterialsCost(row);
  // Airtable: IF({FM}, ...) — truthy-перевірка. FM=0 → гілка-else.
  if (row.fixedMasterPayForService) {
    return workMinusMaterials - row.fixedMasterPayForService;
  }
  return (workMinusMaterials * master.salonPctForService) / 100;
}

/** % майстру за послуги (грн). */
export function masterPayForService(row: ServiceRowInputs, master: MasterContext): number {
  return totalServicePrice(row) - totalMaterialsCost(row) - salonShareForService(row, master);
}

/** % майстру за матеріали (грн). */
export function masterPayForMaterials(row: ServiceRowInputs, master: MasterContext): number {
  return (totalMaterialsCost(row) * master.masterPctForMaterials) / 100;
}

/** % салону за матеріали (грн). */
export function salonShareForMaterials(row: ServiceRowInputs, master: MasterContext): number {
  return totalMaterialsCost(row) - masterPayForMaterials(row, master);
}

/** Дохід Матеріали (салону). */
export function incomeMaterials(row: ServiceRowInputs, master: MasterContext): number {
  return (
    totalMaterialsCost(row) -
    row.materialsPurchaseCost -
    row.fixedMaterialsCostPrice -
    masterPayForMaterials(row, master)
  );
}

/** Всього ціна продажі. */
export function totalSalePrice(row: SaleInputs): number {
  return row.addonSalePrice + row.fixedSalePrice;
}

/** Дохід Продажі (салону, товари). */
export function incomeSales(row: SaleInputs): number {
  return row.fixedSalePrice - row.fixedCostPrice - row.fixedMasterPctForSale;
}

/** Всього дохід салону на одному рядку. */
export function totalSalonIncome(row: ServiceRowInputs, master: MasterContext): number {
  return salonShareForService(row, master) + incomeMaterials(row, master) + incomeSales(row);
}

/** Чистий дохід салону на одному рядку (з урахуванням витрат). */
export function netSalonForRow(row: ServiceRowInputs, master: MasterContext): number {
  return totalSalonIncome(row, master) - row.expenseAmount;
}

/**
 * Оплата майстру — всього. Уніфікована формула для всіх типів оплати.
 *
 * `masterPayForService` уже інкапсулює різницю між гілками:
 *   - commission       : (TSP−TMC) × (1 − salonPct/100)
 *   - hourly з FM>0    : FM (через IF-гілку salonShareForService)
 *   - salary/rental    : 0, якщо salonPct=100 (default); або бонус, якщо <100
 * Тому окремий switch не потрібен — це знімає баг, коли salary-майстер
 * виконує власну послугу і повинен отримати комісію (встановив salonPct<100).
 */
export function masterPayTotal(row: ServiceRowInputs, master: MasterContext): number {
  return (
    masterPayForService(row, master) +
    masterPayForMaterials(row, master) +
    row.fixedMasterPctForSale
  );
}

/**
 * Нарахування майстру — що потрапляє в Airtable rollup «Баланс».
 * УВАГА: це Airtable-логіка. Реальні баланси в додатку рахує
 * `computeBalances` в /api/specialists/route.ts — з snapshot-ами,
 * owner/master pool і debt-routing. Див. коментар у шапці файлу.
 */
export function masterAccrual(row: ServiceRowInputs, master: MasterContext): number {
  return masterPayTotal(row, master) + row.debtAmount;
}

/* ─── Каталог послуг ──────────────────────────────────────────────── */

/** Список послуг.вартість послуги = ціна роботи × К-сть годин + вартість матеріалів продажа. */
export function catalogServicePrice(input: {
  workPrice: number;
  hours: number;
  materialsCost: number;
}): number {
  return input.workPrice * input.hours + input.materialsCost;
}

/* ─── Матеріали (Калькуляція / Замовлення) ────────────────────────── */

/**
 * Замовлення/Калькуляція.До оплати = списано × вартість-пакунка / всього-мл.
 * Пропорційний розрахунок вартості витрачених матеріалів.
 */
export function materialUsageCost(input: {
  usedAmount: number;        // мл/шт списано
  packageCost: number;       // Вартість пакунка (продажна)
  packageTotalAmount: number; // Всього мл/шт в пакунку
}): number {
  if (input.packageTotalAmount === 0) return 0;
  return (input.usedAmount * input.packageCost) / input.packageTotalAmount;
}

/* ─── Config defaults (what to write on master card) ──────────────── */

/**
 * Default `% cалону за послугу` для нової картки майстра.
 *
 * Після Variant A (квіт 2026) це поле редагується для ВСІХ типів, а не
 * тільки commission: salary-адмін може виконувати послуги і отримувати
 * бонус < 100%. Функція лише пропонує розумний default:
 *
 * - commission : значення з форми (зазвичай 30)
 * - rental     : 100 (вся оплата за послугу — салону, майстер платить оренду)
 * - salary     : 100 (ЗП окремо; за бажанням адмін може знизити до < 100
 *                 і отримати бонус саме за свої послуги)
 * - hourly     : 100 (FM перебиває через IF-гілку, але якщо FM=0 — салон
 *                 забирає 100%)
 *
 * ⚠ Історично (до 2026-04) для salary/hourly писалось 0 — баг: формула
 * `Салону за послугу = (TSP−TMC) × 0 / 100 = 0`. Back-fill на Майстрах
 * виконано.
 */
export function defaultSalonPctForService(
  type: CompensationType,
  commissionValue: number,
): number {
  switch (type) {
    case "commission":
      return commissionValue;
    case "rental":
    case "salary":
    case "hourly":
      return 100;
  }
}
