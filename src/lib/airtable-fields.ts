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
//
// ⚠ SHADOW FORMULA FIELDS (Airtable-side): ці поля ще існують у базі як
// formula/rollup (Всього вартість послуги, Салону за послугу, Оплата
// майстру - всього, Загальна вартість роботи/матеріалів, % майстру/салону
// за послуги/матеріали, Дохід Продажі/Матеріали, Чистий дохід салону,
// Всього ціна продажі). НЕ додавай їх сюди і не читай. Єдине джерело
// правди — `pricing.ts` + `computeRowMetrics` у `service-row.ts`. Поля
// лишаються в Airtable як canary до фінальної міграції на Postgres;
// після неї їх можна прибрати з бази без змін у коді.
//
export const SERVICE_FIELDS = {
  date: "Дата",
  master: "Майстер",
  service: "Послуга",
  addonServicePrice: "Доповнення",
  expenseAmount: "Сума витрат",
  expenseType: "Вид витрати",
  debtAmount: "Cума боргу", // (так, в Airtable з латинською С)
  sales: "Продажі",
  saleDetails: "Продажі деталі",
  addonSalePrice: "Доповнення(продажі)",
  created: "Created",
  paymentType: "вид оплати",
  comments: "Коментарі",
  // Lookup/rollup-поля з пов'язаних таблиць (потрібні для `computeRowMetrics`,
  // щоб рахувати незалежно від Airtable formula-fields). Це НЕ формули —
  // це сирі значення, просто витягнуті через lookup/rollup.
  hoursLookup: "К-сть годин", // lookup з каталогу послуг (snapshot тривалості)
  extraMaterialsCalcRollup: "Додаткові матеріали(Калькуляція) new", // rollup з Замовлень
  masterPctForMaterialsLookup: "% майстру за матеріали(відсоток)", // lookup з Майстра
  salonPctForServiceLookup: "% cалону за послугу", // lookup з Майстра (латинська c!)
  masterCompensationTypeLookup: "Тип оплати (from Майстер)", // lookup з Майстра
  // Fixed snapshots майстер-/послуго-контексту, які POST пише з API. Замінюють
  // lookup-поля вище, щоб pricing.ts не залежав від асинхронних Airtable
  // lookups (вони заповнюються через 100-800мс після створення запису —
  // звідси були setTimeout-и у CreateEntryModal). Читаємо fixed-* у першу
  // чергу; якщо 0/empty (старі записи без снепшоту) — fallback на lookup.
  fixedSalonPctForService: "Фікс. % салону за послугу",
  fixedMasterPctForMaterials: "Фікс. % майстру за матеріали",
  fixedMasterCompensationType: "Фікс. тип оплати",
  fixedHours: "Фікс. К-сть годин",
  // Сирі (non-formula) поля журналу.
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
  // Флаг «власник салону». Один на базу. Картка рендериться окремою секцією
  // у StaffScreen; баланс рахується віртуально (netSalon за всю історію
  // мінус вилучення), не зберігається в Airtable.
  isOwner: "Власник",
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
  // Калькулятор послуги (2026-04): якщо hasCalculator=true, поле
  // calculatorJson зберігає JSON-масив [{materialId, qty}], а
  // materialsCost/materialsPurchaseCost перезаписуються на write-snapshot.
  // На GET — завжди перераховуємо live за поточним прайсом матеріалів.
  hasCalculator: "Калькуляція",
  calculatorJson: "Склад калькуляції",
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

// ─── Розподіл прибутку / tblGLXPBSeOy4b35b ─────────────────────────────────
// Append-only ревізії розподілу між N власниками. На будь-яку дату журналу
// активна ревізія = та, що має max(Дата) <= журналДата серед ревізій. Сума
// `Частка %` усіх записів активної ревізії (тобто однієї дати) = 100%.
// Історію не редагуємо — тільки нові ревізії. Див. /api/ownership і
// computeBalances у /api/specialists/route.ts.
export const OWNERSHIP_FIELDS = {
  date: "Дата",
  specialist: "Співробітник",
  sharePct: "Частка %",
  comment: "Коментар",
} as const;
