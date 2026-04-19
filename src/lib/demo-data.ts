// Demo data mirroring real Airtable records from Лямурчик salon
// In production, this will come from Airtable API

export type CompensationType = "commission" | "hourly" | "rental" | "salary";

export interface Specialist {
  id: string;
  name: string;
  role: string;
  compensationType: CompensationType;
  serviceCommission: number; // % salon takes from services
  salesCommission: number;   // % specialist gets from materials used in services
  productSalesCommission: number; // % specialist gets from product sales to clients
  rentalRate?: number;       // fixed rent per period (for rental type)
  hourlyRate?: number;       // rate per hour worked (for hourly type)
  salaryRate?: number;       // daily salary (for salary type)
  balance: number;
  birthday: string;
  avatarColor: "brand" | "amber" | "gray";
  isActive?: boolean;
}

export interface JournalEntry {
  id: string;
  date: string;
  type: "service" | "sale" | "expense" | "rental" | "debt";
  title: string;
  specialistId?: string;
  specialistName?: string;
  amount: number;
  supplement?: number; // доповнення (+/-)
  specialistShare?: number;
  salonShare?: number;
  // Detailed breakdowns
  specialistServiceShare?: number;
  specialistMaterialShare?: number;
  specialistSalesShare?: number;
  salonMaterialShare?: number;
  salonSalesShare?: number;
  materialsCost?: number; // вартість матеріалів (для оренди)
  comment?: string; // коментар до запису
  calculationCost?: number; // додаткова калькуляція
  baseMaterialsCost?: number; // базові матеріали послуги
  saleItems?: { productName: string; quantity: number; lineTotal: number }[]; // multi-product sale details
  source?: "bot" | "admin";
  time?: string;
}

export const specialists: Specialist[] = [
  { id: "1", name: "Соломія", role: "Перукар", compensationType: "commission", serviceCommission: 30, salesCommission: 10, productSalesCommission: 10, balance: 0, birthday: "24 вересня", avatarColor: "brand" },
  { id: "2", name: "Леся Шевчук", role: "Перукар", compensationType: "commission", serviceCommission: 30, salesCommission: 10, productSalesCommission: 10, balance: 0, birthday: "27 листопада", avatarColor: "brand" },
  { id: "3", name: "Лєна Громик", role: "Візажист, бровіст", compensationType: "commission", serviceCommission: 30, salesCommission: 10, productSalesCommission: 10, balance: 0, birthday: "26 вересня", avatarColor: "brand" },
  { id: "4", name: "Іра", role: "Візажист, бровіст", compensationType: "commission", serviceCommission: 25, salesCommission: 10, productSalesCommission: 10, balance: 7, birthday: "9 вересня", avatarColor: "brand" },
  { id: "5", name: "Юля манікюр", role: "Нігтьовий сервіс", compensationType: "commission", serviceCommission: 30, salesCommission: 10, productSalesCommission: 10, balance: 10, birthday: "19 квітня", avatarColor: "brand" },
  { id: "6", name: "Крістіна", role: "Візажист, бровіст", compensationType: "commission", serviceCommission: 30, salesCommission: 10, productSalesCommission: 10, balance: 0, birthday: "28 травня", avatarColor: "brand" },
  { id: "7", name: "Артур", role: "Перукар", compensationType: "rental", serviceCommission: 0, salesCommission: 10, productSalesCommission: 10, rentalRate: 5000, balance: 0, birthday: "5 березня", avatarColor: "amber" },
  { id: "8", name: "Андрій", role: "Перукар", compensationType: "rental", serviceCommission: 0, salesCommission: 10, productSalesCommission: 10, rentalRate: 5000, balance: 0, birthday: "18 серпня", avatarColor: "amber" },
  { id: "9", name: "Антон", role: "Перукар", compensationType: "rental", serviceCommission: 0, salesCommission: 15, productSalesCommission: 15, rentalRate: 4500, balance: -2000, birthday: "2 червня", avatarColor: "amber" },
  { id: "10", name: "Каріна", role: "Адміністратор", compensationType: "salary", serviceCommission: 0, salesCommission: 5, productSalesCommission: 5, salaryRate: 600, balance: 0, birthday: "13 листопада", avatarColor: "gray" },
];

export const journalEntries: JournalEntry[] = [
  { id: "j1", date: "2026-04-08", type: "service", title: "Фарбування коренів APM 2", specialistId: "1", specialistName: "Соломія", amount: 1788, specialistShare: 630, salonShare: 270, source: "bot", time: "15:46" },
  { id: "j2", date: "2026-04-08", type: "service", title: "Фарбування коренів APM 2", specialistId: "1", specialistName: "Соломія", amount: 1731, specialistShare: 630, salonShare: 270, source: "bot", time: "15:44" },
  { id: "j3", date: "2026-04-08", type: "service", title: "Фарбування коренів Yellow 1", specialistId: "2", specialistName: "Леся Шевчук", amount: 1000, specialistShare: 630, salonShare: 270, source: "admin", time: "14:52" },
  { id: "j4", date: "2026-04-08", type: "service", title: "Стрижка жіноча", specialistId: "2", specialistName: "Леся Шевчук", amount: 700, supplement: 100, specialistShare: 420, salonShare: 180, source: "admin", time: "14:51" },
  { id: "j5", date: "2026-04-08", type: "service", title: "Стрижка жіноча", specialistId: "2", specialistName: "Леся Шевчук", amount: 700, supplement: 100, specialistShare: 420, salonShare: 180, source: "admin", time: "14:51" },
  { id: "j6", date: "2026-04-08", type: "service", title: "Укладання волосся 2", specialistId: "2", specialistName: "Леся Шевчук", amount: 500, supplement: -100, specialistShare: 301, salonShare: 129, source: "admin", time: "14:51" },
  { id: "j7", date: "2026-04-08", type: "service", title: "Фарбування коренів Yellow 1", specialistId: "2", specialistName: "Леся Шевчук", amount: 1000, supplement: -200, specialistShare: 630, salonShare: 270, source: "admin", time: "14:49" },
  { id: "j8", date: "2026-04-08", type: "service", title: "Стрижка жіноча", specialistId: "2", specialistName: "Леся Шевчук", amount: 500, supplement: -100, specialistShare: 280, salonShare: 120, source: "admin", time: "14:48" },
  { id: "j9", date: "2026-04-08", type: "service", title: "Фарбування/тонування Yellow 3", specialistId: "2", specialistName: "Леся Шевчук", amount: 1500, supplement: 95, specialistShare: 767, salonShare: 329, source: "admin", time: "14:47" },
  { id: "j10", date: "2026-04-08", type: "service", title: "Фарбування/тонування Yellow 2", specialistId: "2", specialistName: "Леся Шевчук", amount: 1000, supplement: -245, specialistShare: 529, salonShare: 227, source: "admin", time: "14:44" },
  { id: "j11", date: "2026-04-07", type: "rental", title: "Оренда робочого місця", specialistId: "7", specialistName: "Артур", amount: 5000, source: "admin" },
  { id: "j12", date: "2026-04-07", type: "expense", title: "Прибирання", amount: -1300, source: "admin" },
  { id: "j13", date: "2026-04-05", type: "service", title: "Накрутка волосся (чисте волосся) 3", specialistId: "1", specialistName: "Соломія", amount: 700, specialistShare: 490, salonShare: 210, source: "bot", time: "14:19" },
  { id: "j14", date: "2026-04-04", type: "service", title: "Накрутка волосся (чисте волосся) 3", specialistId: "1", specialistName: "Соломія", amount: 700, specialistShare: 490, salonShare: 210, source: "bot", time: "15:44" },
  { id: "j15", date: "2026-04-04", type: "service", title: "Стрижка жіноча", specialistId: "1", specialistName: "Соломія", amount: 600, specialistShare: 350, salonShare: 150, source: "bot", time: "15:45" },
  { id: "j16", date: "2026-04-03", type: "service", title: "Пудрове напилення брів", specialistId: "3", specialistName: "Лєна Громик", amount: 4000, supplement: 500, specialistShare: 2800, salonShare: 1200, source: "admin", time: "20:37" },
  { id: "j17", date: "2026-04-03", type: "service", title: "Корекція та фарбування брів", specialistId: "3", specialistName: "Лєна Громик", amount: 500, source: "admin", time: "20:36" },
  { id: "j18", date: "2026-04-03", type: "service", title: "Макіяж", specialistId: "4", specialistName: "Іра", amount: 1000, specialistShare: 750, salonShare: 250, source: "admin", time: "13:38" },
  { id: "j19", date: "2026-04-02", type: "service", title: "Фарбування коренів Yellow 3", specialistId: "1", specialistName: "Соломія", amount: 1325, specialistShare: 630, salonShare: 270, source: "bot" },
  { id: "j20", date: "2026-04-02", type: "service", title: "Стрижка жіноча", specialistId: "1", specialistName: "Соломія", amount: 600, specialistShare: 350, salonShare: 150, source: "bot" },
];

export const dashboardMetrics = {
  salonServiceShare: 4374,
  salonMaterialShare: 376,
  salonSalesShare: 0,
  salonTotal: 4750,
  specialistServiceShare: 10306,
  specialistMaterialShare: 0,
  specialistSalesShare: 0,
  specialistTotal: 10306,
  debts: 0,
  expenses: 2500,
  cashInRegister: 2250,
  netIncome: 2250,
  materialMargin: 376,
  salesProfit: 0,
};
