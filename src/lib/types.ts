// Shared domain types. Production data comes from Airtable (див. airtable.ts);
// цей файл тільки описує форми, без сидів.

export type CompensationType = "commission" | "hourly" | "rental" | "salary" | "owner";

export interface Specialist {
  id: string;
  name: string;
  compensationType: CompensationType;
  serviceCommission: number;      // % salon takes from services
  salesCommission: number;        // % specialist gets from materials used in services
  productSalesCommission: number; // % specialist gets from product sales to clients
  rentalRate?: number;            // fixed rent per period (rental)
  hourlyRate?: number;            // rate per hour worked (hourly)
  salaryRate?: number;            // daily/period salary (salary)
  balance: number;
  birthday: string;
  avatarColor: "brand" | "amber" | "gray";
  isActive?: boolean;
  /**
   * IDs of linked Спеціалізації records. A specialist can have multiple
   * спеціалізації (admin who also does brows, manicurist who does brows, etc.).
   */
  specializationIds?: string[];
  /**
   * true = запис спеціаліста позначає власника салону. Один на базу.
   * Для owner баланс — віртуальний (netSalon всього часу + підписані
   * вилучення через debt); compensationType автоматично "owner".
   * Рендериться окремою секцією у StaffScreen, НЕ потрапляє в демо-сторінку
   * майстра і в селектори звичайних майстрів.
   */
  isOwner?: boolean;
}

export interface JournalEntry {
  id: string;
  date: string;
  type: "service" | "sale" | "expense" | "rental" | "debt";
  title: string;
  specialistId?: string;
  specialistName?: string;
  amount: number;
  supplement?: number;                  // доповнення (+/-)
  specialistShare?: number;
  salonShare?: number;
  // Detailed breakdowns
  specialistServiceShare?: number;
  specialistMaterialShare?: number;
  specialistSalesShare?: number;
  salonMaterialShare?: number;
  salonSalesShare?: number;
  materialsCost?: number;               // вартість матеріалів (для оренди)
  comment?: string;
  calculationCost?: number;             // додаткова калькуляція
  baseMaterialsCost?: number;           // базові матеріали послуги (див. journal/route.ts — іменоване historically)
  saleItems?: { productId?: string; productName: string; quantity: number; lineTotal: number }[];
  source?: "bot" | "admin";
  time?: string;
  /** Тип витрати (Вид витрати) — тільки для type === "expense". */
  expenseType?: string;
  /** ID послуги з каталогу (для service/rental) — потрібне edit-mode, щоб
   * префілити ServiceEntryModal вибраною послугою. */
  serviceId?: string;
  /** Додаткові години поверх каталогу (для service/rental). */
  extraHours?: number;
  /** Додаткові матеріали (калькуляція), прив'язані до запису —
   *  потрібні edit-mode для префілу. */
  calcMaterials?: { materialId: string; amount: number }[];
  /**
   * true = запис soft-deleted (скасований). За замовчуванням такі не приходять
   * у журнал; з'являються лише коли UI просить ?includeCanceled=1 — щоб
   * показати архів і кнопку «Відновити».
   */
  isCanceled?: boolean;
}
