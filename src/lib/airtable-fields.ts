/**
 * Central registry of Airtable field names per table.
 *
 * Single source of truth — замість магічних string-літералів по всьому коду.
 * Назви полів — саме так, як вони існують в Airtable (мікс укр/англ від прототипу).
 * Якщо поле перейменовано в Airtable — фіксиш тут один раз, TypeScript покаже
 * усі call sites де треба оновити.
 *
 * Ключ об'єкта — семантичний camelCase, значення — реальне ім'я в Airtable.
 * Використання:
 *   fields: [SERVICE_FIELDS.date, SERVICE_FIELDS.master]
 *   f[SERVICE_FIELDS.date] as string
 */

// ─── Послуги (journal) / tblbscwomS21IlWy6 ─────────────────────────────────
// Уся журнальна активність: послуги, продажі, витрати, борги. Тип визначається
// тим, яке поле заповнене (Сума витрат > 0 → витрата, і т.д.).
export const SERVICE_FIELDS = {
  date: "Дата",
  master: "Майстер",
  service: "Послуга",
  totalServicePrice: "Всього вартість послуги",
  addonServicePrice: "Доповнення",
  salonForService: "Салону за послугу",
  masterPayTotal: "Оплата майстру - всього",
  expenseAmount: "Сума витрат",
  expenseType: "Вид витрати",
  debtAmount: "Cума боргу", // (так, в Airtable з латинською С)
  sales: "Продажі",
  saleDetails: "Продажі деталі",
  totalSalePrice: "Всього ціна продажі",
  addonSalePrice: "Доповнення(продажі)",
  created: "Created",
  paymentType: "вид оплати",
  comments: "Коментарі",
  totalWorkCost: "Загальна вартість роботи",
  totalMaterialsCost: "Загальна вартість матеріалів",
  masterPctForServices: "% майстру за послуги",
  masterPctForMaterials: "% майстру за матеріали",
  salonPctForMaterials: "% салону за матеріали",
  fixedMasterPctForSale: "Фікс. % майстру за продаж",
  fixedSalonPctForSale: "Фікс. % салону за продаж",
  additionalMaterials: "Додаткові матеріали(Калькуляція)",
  fixedMaterialsCost: "Фікс. вартість матеріалів",
  fixedMasterPayForService: "Фікс. оплата майстру за послугу",
  fixedPrice: "Фіксована вартість",
  fixedHourlyRate: "Фікс. вартість години",
  materialsPurchaseCostFromService: "вартість матеріалів закупка (from Послуга)",
  fixedMaterialsCostPrice: "Фікс. собівартість матеріалів",
  orders: "Замовлення",
  fixedSalePrice: "Фікс. ціна продажу",
  fixedCostPrice: "Фікс. ціна закупки",
  incomeSales: "Дохід Продажі",
  incomeMaterials: "Дохід Матеріали",
  netSalon: "Чистий дохід салону",
  /**
   * Soft-delete flag. true = запис «скасовано» — фільтруємо з усіх GET-ів і
   * агрегацій. Не видаляємо фізично, щоб не ламати історичні числа й мати
   * змогу відновити. Див. /api/journal DELETE — ставить true замість hard-delete.
   */
  isCanceled: "isCanceled",
  // Додаткові години, введені майстром поверх каталогу (для hourly послуг
  // або погодинних спеціалістів). Зберігається рядком, ми читаємо як number.
  extraHours: "Додаткові години",
} as const;

// ─── Співробітники / tblsfMMvXdTp1DkjY ─────────────────────────────────────
export const SPECIALIST_FIELDS = {
  name: "Ім'я",
  salonPctForService: "% cалону за послугу", // (так, з латинською c)
  masterPctForMaterialsSale: "% майстру за продаж матеріалів",
  masterPctForSale: "% за продаж",
  terms: "Умови співпраці",
  balance: "Баланс",
  birthday: "Дата народження",
  isActive: "is_active",
  compensationType: "Тип оплати",
  specializations: "Спеціалізації",
} as const;

// ─── Список послуг (services catalog) / tblghXXUuVyGVqSv3 ──────────────────
export const SERVICE_CATALOG_FIELDS = {
  name: "Назва",
  workPrice: "ціна роботи",
  materialsCost: "вартість матеріалів продажа",
  materialsPurchaseCost: "закупка",
  hourlyRate: "ціна за годину",
  hours: "К-сть годин",
  category: "Категорія",
  totalPrice: "вартість послуги",
  duration: "тривалість",
  inactive: "неактивний",
} as const;

// ─── Прайс (товари) / tblhW7QGo6svDezGR ────────────────────────────────────
export const PRICE_LIST_FIELDS = {
  name: "Назва",
  salePrice: "ціна продажу",
  costPrice: "ціна закупки",
  sku: "sku",
  article: "артикул",
  barcode: "штрих-код",
  inactive: "неактивний",
} as const;

// ─── Калькуляція (матеріали) / tbl9NtGOpsE3XbdT4 ────────────────────────────
export const MATERIAL_FIELDS = {
  name: "Name",
  totalVolume: "Всього мл/шт",
  salePrice: "Вартість",
  costPrice: "закупка",
  sku: "sku",
  article: "артикул",
  barcode: "штрих-код",
  group: "група",
  unit: "одиниця",
  inactive: "неактивний",
} as const;

// ─── Продажі деталі / tblTbJdSfMpMRqU4r ────────────────────────────────────
export const SALE_DETAIL_FIELDS = {
  quantity: "к-сть",
  priceListItem: "Прайс",
  fixedSalePrice: "Фікс. ціна продажу",
  totalDue: "До оплати",
  fixedCostPrice: "Фікс. ціна закупки",
} as const;

// ─── Категорії послуг / tblwzWzFfPsJqep6v ──────────────────────────────────
export const CATEGORY_FIELDS = {
  name: "name",
  isActive: "isActive",
  sortOrder: "sortOrder",
  description: "description",
  isRental: "isRental",
} as const;

// ─── Спеціалізації / tbllDjZGNnwXBTMB2 ─────────────────────────────────────
export const SPECIALIZATION_FIELDS = {
  name: "name",
  categoryLinks: "Категорії лінки",
  description: "description",
  isActive: "isActive",
  sortOrder: "sortOrder",
} as const;

// ─── Види витрат / tbljEgUp3xOEi8ajX ───────────────────────────────────────
// Довідник типів витрат для Налаштувань (ЗП Адмін, Вода, ...). Журнальне поле
// «Вид витрати» — singleSelect, синхронізація опцій робиться typecast-ом
// на POST/PATCH журналу — Airtable сам додасть нову опцію.
export const EXPENSE_TYPE_FIELDS = {
  name: "name",
  isActive: "isActive",
  sortOrder: "sortOrder",
  description: "description",
} as const;

// ─── Settings (single-row) / tblSTSjnEbV37pWRP ─────────────────────────────
export const SETTINGS_FIELDS = {
  key: "key",
  name: "name",
  currency: "currency",
  businessType: "businessType",
  specialistTerm: "specialistTerm",
  locationTerm: "locationTerm",
  brandColor: "brandColor",
  timezone: "timezone",
  pinHash: "pinHash",
  isOnboarded: "isOnboarded",
  alertNetDropWarn: "alertNetDropWarn",
  alertNetDropCrit: "alertNetDropCrit",
  alertExpensesHigh: "alertExpensesHigh",
  alertLowMargin: "alertLowMargin",
} as const;

// ─── Замовлення (orders/materials usage) / tbl6WADNSFGrw6abz ───────────────
export const ORDER_FIELDS = {
  quantity: "мл/шт",
  material: "Калькуляція",
} as const;
