import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import {
  SERVICE_FIELDS,
  SPECIALIST_FIELDS,
  SERVICE_CATALOG_FIELDS,
  PRICE_LIST_FIELDS,
  SALE_DETAIL_FIELDS,
  CATEGORY_FIELDS,
  SETTINGS_FIELDS,
} from "@/lib/airtable-fields";
import { ROW_METRICS_SOURCE_FIELDS, computeRowMetrics } from "@/lib/service-row";

export const runtime = "nodejs";

interface Aggregates {
  revenueServices: number;
  revenueMaterials: number;
  revenueSales: number;
  netMaterials: number;
  netSales: number;
  netSalon: number;
  masterPay: number;
  expensesTotal: number;
  margin: number; // net / total revenue
  count: number;
  /**
   * Вилучено власником за період — сума абсолютних значень debt-записів
   * де master = owner AND debtAmount < 0. 0 якщо власник не позначений.
   */
  ownerWithdrawals: number;
  /**
   * Довнесення власника у касу — debt > 0 на власника. Рідкісний кейс,
   * але коректно включається у P&L як «повернення в пул».
   */
  ownerContributions: number;
  /**
   * Фактичний рух коштів по касах за період: готівка / карта / unknown
   * (історичні записи без вказаної каси). Сума трьох = оборот − виплати
   * майстрам − витрати − вилучення власника + довнесення власника, тобто
   * приріст «кошти в касі» за період.
   */
  cashByMethod: { cash: number; card: number; unknown: number };
  /** Розбивка обороту (revenue) по касах за період. Сума = totalRevenue. */
  revenueByMethod: { cash: number; card: number; unknown: number };
  /** Розбивка витрат по касах за період. Сума = expensesTotal. */
  expensesByMethod: { cash: number; card: number; unknown: number };
  /**
   * Кількість record-ів, які формують оборот (service + sale + combined).
   * Потрібна для середнього чеку — agg.count включає витрати/борги.
   */
  countRevenue: number;
}

export interface ServiceRow {
  id: string;
  name: string;
  count: number;
  revenue: number;      // оборот послуг (робота)
  netMaterials: number; // чистий з матеріалів
  netSalon: number;     // чистий салону з послуги (робота + матеріали)
}

export interface ServiceTypeSlice {
  name: string;
  value: number; // оборот по цьому виду
}

export interface ProductRow {
  id: string;
  name: string;
  quantity: number;
  revenue: number;
  netProfit: number; // ціна - закупка (без оплати майстру)
}

export interface RiskAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export interface SpecialistRow {
  id: string;
  name: string;
  count: number;
  /** Робота-без-матеріалів (legacy semantic, лишаю на випадок інших читачів). */
  revenueServices: number;
  /** Повний оборот товарів цього майстра (gross sale price). */
  revenueSales: number;
  netMaterials: number;
  netSales: number;
  masterPay: number;
  netSalon: number;
}

interface StatsResponse {
  current: Aggregates;
  previous: Aggregates;
  expensesByCategory: { name: string; value: number }[];
  daily: { date: string; revenue: number; net: number }[];
  specialists: SpecialistRow[];
  topServices: ServiceRow[];
  serviceTypes: ServiceTypeSlice[];
  topProducts: ProductRow[];
  alerts: RiskAlert[];
  range: { from: string; to: string };
}

// Сирі поля — метрики (netSalon, incomeSales, ...) рахуємо через computeRowMetrics.
const FIELDS = [
  SERVICE_FIELDS.date,
  SERVICE_FIELDS.master,
  SERVICE_FIELDS.service,
  SERVICE_FIELDS.sales,
  SERVICE_FIELDS.saleDetails,
  SERVICE_FIELDS.expenseType,
  SERVICE_FIELDS.comments,
  SERVICE_FIELDS.paymentType,
  ...ROW_METRICS_SOURCE_FIELDS,
];

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Strict YYYY-MM-DD — все, що йде в filterByFormula, має бути валідовано, інакше
// спецсимвол (`'`, `)`) ламає формулу або відкриває ін'єкцію. Викидаємо на
// рівні роута, щоб не вставляти невалідні дати в Airtable-запит.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function assertISODate(d: string, label: string): void {
  if (!ISO_DATE_RE.test(d)) {
    throw new Error(`Invalid ${label} date: expected YYYY-MM-DD`);
  }
}

function dateFilter(from: string, to: string): string {
  assertISODate(from, "from");
  assertISODate(to, "to");
  // Skip soft-deleted (isCanceled=true) — дашборд має показувати тільки активні
  // записи, консистентно з журналом.
  return `AND(IS_AFTER({${SERVICE_FIELDS.date}}, DATEADD('${from}', -1, 'day')), IS_BEFORE({${SERVICE_FIELDS.date}}, DATEADD('${to}', 1, 'day')), NOT({${SERVICE_FIELDS.isCanceled}}))`;
}

function empty(): Aggregates {
  return {
    revenueServices: 0,
    revenueMaterials: 0,
    revenueSales: 0,
    netMaterials: 0,
    netSales: 0,
    netSalon: 0,
    masterPay: 0,
    expensesTotal: 0,
    margin: 0,
    count: 0,
    ownerWithdrawals: 0,
    ownerContributions: 0,
    cashByMethod: { cash: 0, card: 0, unknown: 0 },
    revenueByMethod: { cash: 0, card: 0, unknown: 0 },
    expensesByMethod: { cash: 0, card: 0, unknown: 0 },
    countRevenue: 0,
  };
}

type Row = { fields: Record<string, unknown> };

function aggregate(records: Row[], ownerIds?: ReadonlySet<string>): Aggregates {
  const agg = empty();
  for (const r of records) {
    const f = r.fields;
    const metrics = computeRowMetrics(f);
    const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
    const salesLinks = f[SERVICE_FIELDS.sales] as string[] | undefined;
    const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;
    const payment = f[SERVICE_FIELDS.paymentType] as string | undefined;
    const mk: "cash" | "card" | "unknown" =
      payment === "готівка" ? "cash" : payment === "карта" ? "card" : "unknown";

    let type: "service" | "sale" | "expense" | "debt" = "service";
    if (expense !== 0) type = "expense";
    else if (debt !== 0) type = "debt";
    else if (salesLinks && salesLinks.length > 0 && (!serviceLinks || serviceLinks.length === 0)) type = "sale";

    agg.count += 1;

    if (type === "expense") {
      agg.expensesTotal += Math.abs(expense);
      agg.expensesByMethod[mk] += Math.abs(expense);
      agg.cashByMethod[mk] -= Math.abs(expense);
    } else if (type === "debt") {
      // Борги з майстрами — внутрішні перекази, в оборот/дохід не йдуть.
      // АЛЕ якщо запис прив'язаний до власника, це рух прибутку:
      //   negative debt = вилучення (власник забрав з каси)
      //   positive debt = довнесення (власник поклав у касу)
      if (ownerIds && ownerIds.size > 0) {
        const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
        // Any specialist із isOwner=true рахується як власник: якщо борг прив'язаний
        // до БУДЬ-КОГО з власників (включно з master-owner типу Аліни), це рух
        // прибутку, а не внутрішня виплата майстру.
        if (masterLinks && masterLinks.some((id) => ownerIds.has(id))) {
          // Нарахування ЗП (debt > 0 + "Нарахування…" у коментарі) для майстра-
          // власника — це liability по його master-частині, а НЕ owner-внесок.
          const comment = (f[SERVICE_FIELDS.comments] as string | undefined) ?? "";
          const isAccrual = debt > 0 && comment.startsWith("Нарахування");
          if (!isAccrual) {
            if (debt < 0) agg.ownerWithdrawals += Math.abs(debt);
            else agg.ownerContributions += debt;
          }
        }
      }
      // Рух коштів: виплата (debt<0) виводить з каси, довнесення (debt>0,
      // НЕ «Нарахування…») — заводить у касу. Accrual — бухгалтерський рух
      // без касової операції, в касі не відбивається.
      const comment = (f[SERVICE_FIELDS.comments] as string | undefined) ?? "";
      const isAccrual = /^нарахування/i.test(comment.trim());
      if (!isAccrual) {
        agg.cashByMethod[mk] += debt < 0 ? -Math.abs(debt) : Math.abs(debt);
      }
    } else {
      // Service or sale (or combined row): турнувер — з окремих полів,
      // чисті доходи — з формул (= 0, коли відповідної операції немає).
      if (type === "sale") {
        agg.revenueSales += metrics.totalSalePrice;
      } else {
        // Service row: split «Всього вартість послуги» = робота + матеріали.
        agg.revenueMaterials += metrics.totalMaterialsCost;
        agg.revenueServices += Math.max(metrics.totalServicePrice - metrics.totalMaterialsCost, 0);
        // Комбінована послуга+продаж — теж тягнемо оборот продажів.
        agg.revenueSales += metrics.totalSalePrice;
      }
      agg.netSales += metrics.incomeSales;
      agg.netMaterials += metrics.incomeMaterials;
      // Вся виручка запису (те, що клієнт фактично поклав у касу) —
      // повна вартість послуги + продажів у цьому ж записі.
      const entryRevenue = metrics.totalServicePrice + metrics.totalSalePrice;
      agg.cashByMethod[mk] += entryRevenue;
      agg.revenueByMethod[mk] += entryRevenue;
      agg.countRevenue += 1;
    }

    // Чистий дохід салону — рахується через pricing.ts (єдина точка правди).
    // Покриває і послуги, і продажі, і матеріали, за мінусом витрат запису.
    agg.netSalon += metrics.netSalon;
    agg.masterPay += metrics.masterPayTotal;
  }

  const totalRevenue = agg.revenueServices + agg.revenueMaterials + agg.revenueSales;
  agg.margin = totalRevenue > 0 ? agg.netSalon / totalRevenue : 0;
  return agg;
}

function groupExpenses(records: Row[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    const f = r.fields;
    const amount = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    if (amount === 0) continue;
    const name = ((f[SERVICE_FIELDS.expenseType] as string | undefined) || "Без категорії").trim();
    out.set(name, (out.get(name) || 0) + Math.abs(amount));
  }
  return out;
}

function daily(records: Row[], from: string, to: string): { date: string; revenue: number; net: number }[] {
  const map = new Map<string, { revenue: number; net: number }>();

  // Pre-fill days so the chart is continuous
  const start = parseISO(from);
  const end = parseISO(to);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    map.set(fmt(d), { revenue: 0, net: 0 });
  }

  for (const r of records) {
    const f = r.fields;
    const date = f[SERVICE_FIELDS.date] as string | undefined;
    if (!date) continue;
    const bucket = map.get(date) || { revenue: 0, net: 0 };
    const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
    const metrics = computeRowMetrics(f);
    if (expense === 0 && debt === 0) {
      bucket.revenue += metrics.totalServicePrice + metrics.totalSalePrice;
    }
    bucket.net += metrics.netSalon;
    map.set(date, bucket);
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, ...v }));
}

function bySpecialist(records: Row[], nameMap: Map<string, string>): SpecialistRow[] {
  const map = new Map<string, SpecialistRow>();

  for (const r of records) {
    const f = r.fields;
    const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
    if (expense !== 0 || debt !== 0) continue; // витрати/борги не прив'язуємо до майстра

    const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
    if (!masterLinks || masterLinks.length === 0) continue;
    const id = masterLinks[0];

    let row = map.get(id);
    if (!row) {
      row = {
        id,
        name: nameMap.get(id) || "—",
        count: 0,
        revenueServices: 0,
        revenueSales: 0,
        netMaterials: 0,
        netSales: 0,
        masterPay: 0,
        netSalon: 0,
      };
      map.set(id, row);
    }

    row.count += 1;

    const salesLinks = f[SERVICE_FIELDS.sales] as string[] | undefined;
    const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;
    const isSaleOnly = salesLinks && salesLinks.length > 0 && (!serviceLinks || serviceLinks.length === 0);

    const metrics = computeRowMetrics(f);
    if (!isSaleOnly) {
      row.revenueServices += Math.max(metrics.totalServicePrice - metrics.totalMaterialsCost, 0);
    }
    // Gross-оборот товарів (повна сума, яку клієнт заплатив за товари в цьому
    // рядку). Може бути і в sale-only, і в комбінованому service+продаж.
    row.revenueSales += metrics.totalSalePrice;
    row.netMaterials += metrics.incomeMaterials;
    row.netSales += metrics.incomeSales;
    row.masterPay += metrics.masterPayTotal;
    row.netSalon += metrics.netSalon;
  }

  return [...map.values()].sort((a, b) => b.netSalon - a.netSalon);
}

function byService(records: Row[], nameMap: Map<string, string>): ServiceRow[] {
  const map = new Map<string, ServiceRow>();

  for (const r of records) {
    const f = r.fields;
    const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
    if (expense !== 0 || debt !== 0) continue;

    const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;
    if (!serviceLinks || serviceLinks.length === 0) continue;
    const id = serviceLinks[0];

    let row = map.get(id);
    if (!row) {
      row = {
        id,
        name: nameMap.get(id) || "—",
        count: 0,
        revenue: 0,
        netMaterials: 0,
        netSalon: 0,
      };
      map.set(id, row);
    }

    row.count += 1;
    const metrics = computeRowMetrics(f);
    // Оборот = повна вартість послуги (робота + матеріали, тобто все що клієнт заплатив).
    // Це консистентно з тим, що net менший за оборот.
    row.revenue += metrics.totalServicePrice;
    row.netMaterials += metrics.incomeMaterials;
    // Канонічний netSalon покриває послугу + продажі + матеріали в одному рядку.
    // Для byService треба відняти чисту sale-частину, щоб атрибуція була тільки за послугу.
    row.netSalon += metrics.netSalon - metrics.incomeSales;
  }

  return [...map.values()].sort((a, b) => b.netSalon - a.netSalon);
}

function byServiceType(records: Row[], serviceToCategoryName: Map<string, string>): ServiceTypeSlice[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const f = r.fields;
    const expense = (f[SERVICE_FIELDS.expenseAmount] as number | undefined) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number | undefined) || 0;
    if (expense !== 0 || debt !== 0) continue;

    const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;
    if (!serviceLinks || serviceLinks.length === 0) continue;

    // Resolve service → category name via pre-built map (replaces deprecated `Вид послуги` lookup).
    const type = serviceToCategoryName.get(serviceLinks[0]) || "Без виду";

    const metrics = computeRowMetrics(f);
    map.set(type, (map.get(type) || 0) + metrics.totalServicePrice);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

interface ProductInfo { name: string }
interface DetailRow {
  id: string;
  productId: string;
  quantity: number;
  salePrice: number;  // фіксований снепшот
  costPrice: number;
  lineTotal: number;
}

function byProduct(
  details: DetailRow[],
  productInfo: Map<string, ProductInfo>,
): ProductRow[] {
  const byId = new Map<string, ProductRow>();

  for (const d of details) {
    const name = productInfo.get(d.productId)?.name || "—";

    let row = byId.get(d.productId);
    if (!row) {
      row = { id: d.productId, name, quantity: 0, revenue: 0, netProfit: 0 };
      byId.set(d.productId, row);
    }
    row.quantity += d.quantity;
    row.revenue += d.lineTotal;
    row.netProfit += d.lineTotal - d.costPrice * d.quantity;
  }

  return [...byId.values()].sort((a, b) => b.revenue - a.revenue);
}

interface AlertThresholds {
  netDropWarn: number;   // %
  netDropCrit: number;   // %
  expensesHigh: number;  // %
  lowMargin: number;     // %
}

function buildAlerts(
  current: Aggregates,
  previous: Aggregates,
  specialists: SpecialistRow[],
  details: DetailRow[],
  productInfo: Map<string, ProductInfo>,
  thresholds: AlertThresholds,
): RiskAlert[] {
  const alerts: RiskAlert[] = [];
  const warnFrac = thresholds.netDropWarn / 100;
  const critFrac = thresholds.netDropCrit / 100;
  const expFrac = thresholds.expensesHigh / 100;
  const marginFrac = thresholds.lowMargin / 100;

  // 1) Падіння чистого доходу MoM (пороги з settings)
  if (previous.netSalon > 0 && previous.count > 0) {
    const diff = (current.netSalon - previous.netSalon) / previous.netSalon;
    if (diff < -critFrac) {
      alerts.push({
        id: "net-drop-critical",
        severity: "critical",
        title: "Різке падіння чистого доходу",
        detail: `Чистий дохід впав на ${Math.round(diff * -100)}% у порівнянні з попереднім періодом (${Math.round(previous.netSalon)} → ${Math.round(current.netSalon)}).`,
      });
    } else if (diff < -warnFrac) {
      alerts.push({
        id: "net-drop-warning",
        severity: "warning",
        title: "Падіння чистого доходу",
        detail: `Чистий дохід впав на ${Math.round(diff * -100)}% у порівнянні з попереднім періодом.`,
      });
    }
  }

  // 2) Витрати перекривають дохід (поріг з settings)
  const grossRevenue = current.revenueServices + current.revenueMaterials + current.revenueSales;
  if (current.expensesTotal > 0 && grossRevenue > 0) {
    const ratio = current.expensesTotal / grossRevenue;
    if (ratio > expFrac) {
      alerts.push({
        id: "expenses-high",
        severity: "warning",
        title: "Висока частка витрат",
        detail: `Витрати склали ${Math.round(ratio * 100)}% від обороту (поріг ${thresholds.expensesHigh}%).`,
      });
    }
  }

  // 3) Від'ємний чистий дохід за період
  if (current.netSalon < 0) {
    alerts.push({
      id: "net-negative",
      severity: "critical",
      title: "Чистий дохід від'ємний",
      detail: `Салон у мінусі за період: ${Math.round(current.netSalon)}.`,
    });
  }

  // 4) Маржинальність нижче порогу (поріг з settings)
  if (current.margin < marginFrac && current.count > 0 && grossRevenue > 0) {
    alerts.push({
      id: "low-margin",
      severity: "info",
      title: "Низька маржинальність",
      detail: `Поточна маржинальність ${(current.margin * 100).toFixed(1)}% — менше ${thresholds.lowMargin}%.`,
    });
  }

  // 5) Майстри без записів у поточному періоді при попередній активності
  if (specialists.length === 0 && current.count > 0) {
    // пропускаємо — не критично
  }

  // 6) Продаж нижче закупки (негативна маржа по товару)
  const lossProducts = new Map<string, { name: string; loss: number }>();
  for (const d of details) {
    const margin = d.salePrice - d.costPrice;
    if (margin < 0 && d.costPrice > 0) {
      const name = productInfo.get(d.productId)?.name || "товар";
      const prev = lossProducts.get(d.productId);
      lossProducts.set(d.productId, {
        name,
        loss: (prev?.loss || 0) + Math.abs(margin) * d.quantity,
      });
    }
  }
  if (lossProducts.size > 0) {
    const top = [...lossProducts.values()].sort((a, b) => b.loss - a.loss)[0];
    alerts.push({
      id: "product-loss",
      severity: "warning",
      title: "Продаж нижче закупки",
      detail: `${lossProducts.size} товар(ів) продано дешевше собівартості, найбільший збиток: ${top.name} (−${Math.round(top.loss)}).`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "ok",
      severity: "info",
      title: "Без критичних сигналів",
      detail: "Усе в межах норми за поточний період.",
    });
  }

  return alerts;
}

function prevRange(from: string, to: string): { from: string; to: string } {
  const start = parseISO(from);
  const end = parseISO(to);
  const lenDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (lenDays - 1));
  return { from: fmt(prevStart), to: fmt(prevEnd) };
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "from & to required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to)) {
      return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
    }

    const prev = prevRange(from, to);

    const [currentRecs, prevRecs, specRecs, svcCatalog, categoryRecs, saleDetails, priceList, settingsRecs] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: dateFilter(from, to),
        fields: FIELDS,
      }),
      fetchAllRecords(TABLES.services, {
        filterByFormula: dateFilter(prev.from, prev.to),
        fields: FIELDS,
      }),
      fetchAllRecords(TABLES.specialists, { fields: [SPECIALIST_FIELDS.name, SPECIALIST_FIELDS.isOwner] }),
      fetchAllRecords(TABLES.servicesCatalog, { fields: [SERVICE_CATALOG_FIELDS.name, SERVICE_CATALOG_FIELDS.category] }),
      fetchAllRecords(TABLES.categories, { fields: [CATEGORY_FIELDS.name] }),
      fetchAllRecords(TABLES.saleDetails, {
        fields: [SALE_DETAIL_FIELDS.quantity, SALE_DETAIL_FIELDS.priceListItem, SALE_DETAIL_FIELDS.fixedSalePrice, SALE_DETAIL_FIELDS.fixedCostPrice, SALE_DETAIL_FIELDS.totalDue],
      }),
      fetchAllRecords(TABLES.priceList, { fields: [PRICE_LIST_FIELDS.name] }),
      fetchAllRecords(TABLES.settings, {
        filterByFormula: `{key} = "current"`,
        fields: [SETTINGS_FIELDS.alertNetDropWarn, SETTINGS_FIELDS.alertNetDropCrit, SETTINGS_FIELDS.alertExpensesHigh, SETTINGS_FIELDS.alertLowMargin],
      }),
    ]);

    const sFields = settingsRecs[0]?.fields || {};
    const pickNum = (v: unknown, fallback: number): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    const thresholds: AlertThresholds = {
      netDropWarn: pickNum(sFields[SETTINGS_FIELDS.alertNetDropWarn], 15),
      netDropCrit: pickNum(sFields[SETTINGS_FIELDS.alertNetDropCrit], 30),
      expensesHigh: pickNum(sFields[SETTINGS_FIELDS.alertExpensesHigh], 60),
      lowMargin: pickNum(sFields[SETTINGS_FIELDS.alertLowMargin], 20),
    };

    const nameMap = new Map<string, string>();
    // Усі власники (включно з master+owner типу Аліни). Раніше тут був один
    // ownerId — last-match-wins — тож withdrawals від майстра-власника губились
    // у buckets «виплати майстрам» замість «вилучено власником».
    const ownerIds = new Set<string>();
    for (const s of specRecs) {
      nameMap.set(s.id, (s.fields[SPECIALIST_FIELDS.name] as string) || "—");
      if (s.fields[SPECIALIST_FIELDS.isOwner] === true) ownerIds.add(s.id);
    }

    const svcNameMap = new Map<string, string>();
    for (const s of svcCatalog) svcNameMap.set(s.id, (s.fields[SERVICE_CATALOG_FIELDS.name] as string) || "—");

    // Resolve service → category name via linked field on Список послуг (replaces the
    // deprecated `Вид послуги` multiSelect + lookup chain). Client-side join keeps
    // the analytics independent of Airtable lookup config.
    const categoryNameById = new Map<string, string>();
    for (const c of categoryRecs) categoryNameById.set(c.id, (c.fields[CATEGORY_FIELDS.name] as string) || "—");
    const serviceToCategoryName = new Map<string, string>();
    for (const s of svcCatalog) {
      const catLinks = s.fields[SERVICE_CATALOG_FIELDS.category] as string[] | undefined;
      const catName = catLinks && catLinks.length > 0 ? categoryNameById.get(catLinks[0]) : undefined;
      if (catName) serviceToCategoryName.set(s.id, catName);
    }

    const productInfo = new Map<string, ProductInfo>();
    for (const p of priceList) {
      productInfo.set(p.id, {
        name: (p.fields[PRICE_LIST_FIELDS.name] as string) || "—",
      });
    }

    // Collect detail IDs referenced by current-period services, then map those details.
    const wantedDetailIds = new Set<string>();
    for (const r of currentRecs) {
      const links = r.fields[SERVICE_FIELDS.saleDetails] as string[] | undefined;
      if (links) for (const id of links) wantedDetailIds.add(id);
    }
    const details: DetailRow[] = [];
    for (const d of saleDetails) {
      if (!wantedDetailIds.has(d.id)) continue;
      const priceLinks = d.fields[SALE_DETAIL_FIELDS.priceListItem] as string[] | undefined;
      if (!priceLinks || priceLinks.length === 0) continue;
      const qty = (d.fields[SALE_DETAIL_FIELDS.quantity] as number) || 1;
      const salePrice = (d.fields[SALE_DETAIL_FIELDS.fixedSalePrice] as number) || 0;
      const costPrice = (d.fields[SALE_DETAIL_FIELDS.fixedCostPrice] as number) || 0;
      const lineTotal = (d.fields[SALE_DETAIL_FIELDS.totalDue] as number) || salePrice * qty;
      details.push({
        id: d.id,
        productId: priceLinks[0],
        quantity: qty,
        salePrice,
        costPrice,
        lineTotal,
      });
    }
    const topProducts = byProduct(details, productInfo);

    const current = aggregate(currentRecs, ownerIds);
    const previous = aggregate(prevRecs, ownerIds);

    const expensesMap = groupExpenses(currentRecs);
    const expensesByCategory = [...expensesMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const response: StatsResponse = {
      current,
      previous,
      expensesByCategory,
      daily: daily(currentRecs, from, to),
      specialists: bySpecialist(currentRecs, nameMap),
      topServices: byService(currentRecs, svcNameMap).slice(0, 10),
      serviceTypes: byServiceType(currentRecs, serviceToCategoryName),
      topProducts: topProducts.slice(0, 10),
      alerts: buildAlerts(
        current,
        previous,
        bySpecialist(currentRecs, nameMap),
        details,
        productInfo,
        thresholds,
      ),
      range: { from, to },
    };

    return NextResponse.json(response);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.error("owner/stats failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
