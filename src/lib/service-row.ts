/**
 * Адаптер: Airtable-журнал-запис → ServiceRowInputs + MasterContext → метрики.
 *
 * Мета файлу: централізувати мапінг «сирі поля Airtable → pricing.ts».
 * Раніше кожен роут читав `f[SERVICE_FIELDS.netSalon]` напряму — це
 * прив'язувало нас до Airtable formula-fields. Тепер роут читає
 * `computeRowMetrics(f).netSalon` — одна функція для всіх місць, і та
 * дає точно такі самі числа (перевірено golden-test на 15 записах).
 *
 * Безпечний дрейф: якщо читач ще не мігрував — він все ще може зчитувати
 * Airtable-formula. Мігровані читачі не залежать від того, чи
 * formula-поле існує. При переїзді на Postgres — видалимо formula з
 * Airtable, а ті кілька читачів що лишились, впадуть з нулями, і це
 * стане сигналом «доміграй».
 */

import { SERVICE_FIELDS } from "./airtable-fields";
import { compensationTypeFromLabel } from "./compensation";
import {
  type MasterContext,
  type ServiceRowInputs,
  incomeMaterials,
  incomeSales,
  masterAccrual,
  masterPayForMaterials,
  masterPayForService,
  masterPayTotal,
  netSalonForRow,
  salonShareForMaterials,
  salonShareForService,
  totalMaterialsCost,
  totalSalePrice,
  totalSalonIncome,
  totalServicePrice,
  totalWorkCost,
} from "./pricing";

type FieldsMap = Record<string, unknown>;

/** Airtable lookup/rollup повертає масив — беремо перше число. 0 якщо пусто. */
function firstNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value) && value.length > 0) {
    const v = value[0];
    if (typeof v === "number") return v;
  }
  return 0;
}

/** Airtable lookup від singleSelect → масив [{id,name,color}] або масив рядків. */
function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) {
    const v = value[0];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && "name" in v) {
      const name = (v as { name?: unknown }).name;
      if (typeof name === "string") return name;
    }
  }
  return "";
}

/**
 * Снепшот-fallback: спочатку дивимось у fixed-* поле (яке POST пише з API
 * синхронно), якщо порожнє — fallback на lookup. Так нові записи рахуються
 * одразу при створенні (без 400-800мс затримки на Airtable lookup), а старі
 * записи без снепшоту й далі читаються через lookup.
 */
function preferFixed(fixed: unknown, lookup: unknown): number {
  if (typeof fixed === "number" && fixed !== 0) return fixed;
  return firstNumber(lookup);
}

/** Сирі входи одного рядка журналу, витягнуті з Airtable fields object. */
export function serviceRowInputs(f: FieldsMap): ServiceRowInputs {
  return {
    fixedPrice: (f[SERVICE_FIELDS.fixedPrice] as number) || 0,
    fixedHourlyRate: (f[SERVICE_FIELDS.fixedHourlyRate] as number) || 0,
    hours: preferFixed(f[SERVICE_FIELDS.fixedHours], f[SERVICE_FIELDS.hoursLookup]),
    extraHours: (f[SERVICE_FIELDS.extraHours] as number) || 0,
    addonServicePrice: (f[SERVICE_FIELDS.addonServicePrice] as number) || 0,
    fixedMaterialsCost: (f[SERVICE_FIELDS.fixedMaterialsCost] as number) || 0,
    extraMaterialsCalc: (f[SERVICE_FIELDS.additionalMaterials] as number) || 0,
    extraMaterialsCalcRollup: (f[SERVICE_FIELDS.extraMaterialsCalcRollup] as number) || 0,
    fixedMasterPayForService: (f[SERVICE_FIELDS.fixedMasterPayForService] as number) || 0,
    materialsPurchaseCost: (f[SERVICE_FIELDS.materialsPurchaseCostFromService] as number) || 0,
    fixedMaterialsCostPrice: (f[SERVICE_FIELDS.fixedMaterialsCostPrice] as number) || 0,
    fixedSalePrice: (f[SERVICE_FIELDS.fixedSalePrice] as number) || 0,
    fixedCostPrice: (f[SERVICE_FIELDS.fixedCostPrice] as number) || 0,
    fixedMasterPctForSale: (f[SERVICE_FIELDS.fixedMasterPctForSale] as number) || 0,
    addonSalePrice: (f[SERVICE_FIELDS.addonSalePrice] as number) || 0,
    expenseAmount: (f[SERVICE_FIELDS.expenseAmount] as number) || 0,
    debtAmount: (f[SERVICE_FIELDS.debtAmount] as number) || 0,
  };
}

/** Контекст майстра, витягнутий з fixed-* (снепшот) або lookup (fallback). */
export function masterContextFromRow(f: FieldsMap): MasterContext {
  // pricing.ts очікує тип без "owner" (власник на рядку поведе себе як
  // commission — стандартний розрахунок частки салону, без вилучення).
  // Тип беремо з fixed-снепшоту якщо є, інакше — з lookup.
  const fixedTypeRaw = f[SERVICE_FIELDS.fixedMasterCompensationType];
  const typeLabel = typeof fixedTypeRaw === "string" && fixedTypeRaw
    ? fixedTypeRaw
    : firstString(f[SERVICE_FIELDS.masterCompensationTypeLookup]);
  const type = compensationTypeFromLabel(typeLabel);
  return {
    type: type === "owner" ? "commission" : type,
    salonPctForService: preferFixed(
      f[SERVICE_FIELDS.fixedSalonPctForService],
      f[SERVICE_FIELDS.salonPctForServiceLookup],
    ),
    masterPctForMaterials: preferFixed(
      f[SERVICE_FIELDS.fixedMasterPctForMaterials],
      f[SERVICE_FIELDS.masterPctForMaterialsLookup],
    ),
  };
}

/**
 * Всі метрики одного рядка журналу, обчислені в коді (не з Airtable formula).
 * Збігається з Airtable formula-fields 1:1 (перевірено golden-test).
 */
export interface RowMetrics {
  totalWorkCost: number;
  totalMaterialsCost: number;
  totalServicePrice: number;
  salonShareForService: number;
  masterPayForService: number;
  masterPayForMaterials: number;
  salonShareForMaterials: number;
  incomeMaterials: number;
  totalSalePrice: number;
  incomeSales: number;
  totalSalonIncome: number;
  netSalon: number;
  masterPayTotal: number;
  masterAccrual: number;
}

export function computeRowMetrics(f: FieldsMap): RowMetrics {
  const row = serviceRowInputs(f);
  const master = masterContextFromRow(f);
  return {
    totalWorkCost: totalWorkCost(row),
    totalMaterialsCost: totalMaterialsCost(row),
    totalServicePrice: totalServicePrice(row),
    salonShareForService: salonShareForService(row, master),
    masterPayForService: masterPayForService(row, master),
    masterPayForMaterials: masterPayForMaterials(row, master),
    salonShareForMaterials: salonShareForMaterials(row, master),
    incomeMaterials: incomeMaterials(row, master),
    totalSalePrice: totalSalePrice(row),
    incomeSales: incomeSales(row),
    totalSalonIncome: totalSalonIncome(row, master),
    netSalon: netSalonForRow(row, master),
    masterPayTotal: masterPayTotal(row, master),
    masterAccrual: masterAccrual(row, master),
  };
}

/** Набір полів, які треба запитати в Airtable щоб computeRowMetrics працював. */
export const ROW_METRICS_SOURCE_FIELDS: readonly string[] = [
  SERVICE_FIELDS.fixedPrice,
  SERVICE_FIELDS.fixedHourlyRate,
  SERVICE_FIELDS.hoursLookup,
  SERVICE_FIELDS.extraHours,
  SERVICE_FIELDS.addonServicePrice,
  SERVICE_FIELDS.fixedMaterialsCost,
  SERVICE_FIELDS.additionalMaterials,
  SERVICE_FIELDS.extraMaterialsCalcRollup,
  SERVICE_FIELDS.fixedMasterPayForService,
  SERVICE_FIELDS.materialsPurchaseCostFromService,
  SERVICE_FIELDS.fixedMaterialsCostPrice,
  SERVICE_FIELDS.fixedSalePrice,
  SERVICE_FIELDS.fixedCostPrice,
  SERVICE_FIELDS.fixedMasterPctForSale,
  SERVICE_FIELDS.addonSalePrice,
  SERVICE_FIELDS.expenseAmount,
  SERVICE_FIELDS.debtAmount,
  SERVICE_FIELDS.salonPctForServiceLookup,
  SERVICE_FIELDS.masterPctForMaterialsLookup,
  SERVICE_FIELDS.masterCompensationTypeLookup,
  SERVICE_FIELDS.fixedSalonPctForService,
  SERVICE_FIELDS.fixedMasterPctForMaterials,
  SERVICE_FIELDS.fixedMasterCompensationType,
  SERVICE_FIELDS.fixedHours,
] as const;
