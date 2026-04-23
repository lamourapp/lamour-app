import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";
import {
  SERVICE_FIELDS,
  SPECIALIST_FIELDS,
  SERVICE_CATALOG_FIELDS,
  SETTINGS_FIELDS,
} from "@/lib/airtable-fields";
import { ROW_METRICS_SOURCE_FIELDS, computeRowMetrics } from "@/lib/service-row";

/**
 * Звіт ЗП майстра за період — публічний endpoint (без PIN), лінк
 * містить specialistId + from + to, знає тільки той, кому відправили.
 *
 * Свідомо НЕ використовуємо Airtable rollup-и/формули, які знають тільки
 * про повний баланс — рахуємо агрегати з сирих journal-записів тут, у
 * коді. Коли базу перенесемо з Airtable на Postgres — поміняється
 * тільки fetch, решта логіки портується 1:1.
 *
 * Response:
 *   - salon: { name, currency, timezone }
 *   - specialist: { id, name, compensationLabel }
 *   - period: { from, to }
 *   - accrued: сума нарахованого за період (по типах)
 *   - paid: сума виплат за період (|negative debts|)
 *   - contributed: довнесення (positive debts) — рідко, але буває
 *   - remaining: скільки ми винні ЗА ЦЕЙ ПЕРІОД (accrued − paid + contributed)
 *   - entries: список записів для деталізації
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const specialistId = sp.get("specialistId") || "";
    const from = sp.get("from") || "";
    const to = sp.get("to") || "";

    if (!specialistId || !from || !to) {
      return NextResponse.json(
        { error: "specialistId, from, to are required" },
        { status: 400 },
      );
    }

    // Strict YYYY-MM-DD: отруйні символи в from/to поламають filterByFormula.
    const ISO = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO.test(from) || !ISO.test(to)) {
      return NextResponse.json(
        { error: "from/to must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Date filter + exclude canceled. Майстра фільтруємо на клієнті
    // (Airtable filter з linked-records по id нестабільний).
    const dateFilter = `AND(IS_AFTER({${SERVICE_FIELDS.date}}, DATEADD('${from}', -1, 'day')), IS_BEFORE({${SERVICE_FIELDS.date}}, DATEADD('${to}', 1, 'day')), NOT({${SERVICE_FIELDS.isCanceled}}))`;

    const [settingsRecords, specialistRecords, records, serviceCatalog] =
      await Promise.all([
        fetchAllRecords(TABLES.settings, {
          filterByFormula: `{key} = "current"`,
          fields: [
            SETTINGS_FIELDS.name,
            SETTINGS_FIELDS.currency,
            SETTINGS_FIELDS.timezone,
            SETTINGS_FIELDS.specialistTerm,
            SETTINGS_FIELDS.brandColor,
          ],
        }),
        fetchAllRecords(TABLES.specialists, {
          fields: [
            SPECIALIST_FIELDS.name,
            SPECIALIST_FIELDS.compensationType,
            SPECIALIST_FIELDS.salonPctForService,
            SPECIALIST_FIELDS.masterPctForMaterialsSale,
            SPECIALIST_FIELDS.masterPctForSale,
            SPECIALIST_FIELDS.terms,
            SPECIALIST_FIELDS.isOwner,
          ],
        }),
        fetchAllRecords(TABLES.services, {
          filterByFormula: dateFilter,
          sort: [{ field: SERVICE_FIELDS.date, direction: "desc" }],
          // Обчислювані значення (masterPctFor*, masterPayTotal) беремо з
          // computeRowMetrics, не з Airtable-formula.
          fields: [
            SERVICE_FIELDS.date,
            SERVICE_FIELDS.master,
            SERVICE_FIELDS.service,
            SERVICE_FIELDS.fixedMasterPctForSale,
            SERVICE_FIELDS.sales,
            SERVICE_FIELDS.saleDetails,
            SERVICE_FIELDS.comments,
            ...ROW_METRICS_SOURCE_FIELDS,
          ],
        }),
        fetchAllRecords(TABLES.servicesCatalog, {
          fields: [SERVICE_CATALOG_FIELDS.name],
        }),
      ]);

    const specRecord = specialistRecords.find((r) => r.id === specialistId);
    if (!specRecord) {
      return NextResponse.json(
        { error: "Specialist not found" },
        { status: 404 },
      );
    }

    // Блокуємо тільки «чистих» власників (compensationType=owner) — їм нема
    // що показати як майстру. Master+owner (isOwner=true, але compensationType
    // salary/hourly/commission) — повноцінно отримує звіт по своїй master-
    // частині. Раніше ця перевірка відтинала й Аліну.
    if (
      (specRecord.fields[SPECIALIST_FIELDS.compensationType] as string) === "owner"
    ) {
      return NextResponse.json(
        { error: "Report not available for owner" },
        { status: 400 },
      );
    }

    const specFields = specRecord.fields;
    const compensationType =
      (specFields[SPECIALIST_FIELDS.compensationType] as string) || "";
    const terms = (specFields[SPECIALIST_FIELDS.terms] as number) || 0;
    const salonPct =
      (specFields[SPECIALIST_FIELDS.salonPctForService] as number) || 0;
    const materialPct =
      (specFields[SPECIALIST_FIELDS.masterPctForMaterialsSale] as number) || 0;
    const salesPct =
      (specFields[SPECIALIST_FIELDS.masterPctForSale] as number) || 0;

    // Лейбл умов співпраці — для хедеру звіту. Не localized heavy, просто
    // коротка підпис.
    let compensationLabel = "";
    switch (compensationType) {
      case "комісія":
        compensationLabel = `Комісія ${100 - salonPct}% від послуг`;
        break;
      case "оренда":
        compensationLabel = `Оренда${terms ? ` ${terms}` : ""}`;
        break;
      case "погодинна":
        compensationLabel = `Погодинна${terms ? ` · ${terms}/год` : ""}`;
        break;
      case "зарплата":
        compensationLabel = `Зарплата${terms ? ` ${terms}/день` : ""}`;
        break;
    }
    const extras: string[] = [];
    if (materialPct > 0) extras.push(`матеріали ${materialPct}%`);
    if (salesPct > 0) extras.push(`продаж ${salesPct}%`);
    if (extras.length > 0) {
      compensationLabel = `${compensationLabel} · ${extras.join(" · ")}`;
    }

    // Serv catalog lookup — для назв записів у списку.
    const serviceNameById = new Map<string, string>();
    serviceCatalog.forEach((r) =>
      serviceNameById.set(
        r.id,
        (r.fields[SERVICE_CATALOG_FIELDS.name] as string) || "",
      ),
    );

    // Фільтруємо записи по майстру і рахуємо агрегати + список.
    // Тип запису визначаємо так само як в /api/journal — за filled fields.
    type Entry = {
      id: string;
      date: string;
      type: "service" | "sale" | "rental" | "debt" | "expense" | "";
      title: string;
      amount: number;
      comment: string;
    };

    let accruedServices = 0; // нараховано з послуг (service + material share)
    let accruedMaterials = 0; // окремо матеріал-частина (для деталізації)
    let accruedServicesOnly = 0; // окремо частка за роботу
    let accruedSales = 0; // нараховано з продажів товарів
    let paidOutAbs = 0; // виплачено майстру (|negative debts|)
    let contributed = 0; // довнесення (positive debts)
    let countServices = 0;
    let countSales = 0;
    let countPaid = 0;
    const entries: Entry[] = [];

    for (const r of records) {
      const f = r.fields;
      const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
      if (!masterLinks?.includes(specialistId)) continue;

      const date = (f[SERVICE_FIELDS.date] as string) || "";
      const comment = (f[SERVICE_FIELDS.comments] as string) || "";
      const debt = (f[SERVICE_FIELDS.debtAmount] as number) || 0;
      const expense = (f[SERVICE_FIELDS.expenseAmount] as number) || 0;
      const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;
      const saleLinks = f[SERVICE_FIELDS.sales] as string[] | undefined;
      const saleDetailLinks = f[SERVICE_FIELDS.saleDetails] as
        | string[]
        | undefined;

      // Розрахунок (debt). Буває +/-: + = довнесення, - = виплата майстру.
      if (debt !== 0) {
        if (debt < 0) {
          paidOutAbs += Math.abs(debt);
          countPaid += 1;
        } else {
          contributed += debt;
        }
        entries.push({
          id: r.id,
          date,
          type: "debt",
          title: debt < 0 ? "Виплата" : "Довнесення",
          amount: debt, // signed: - виплата, + довнесення
          comment,
        });
        continue;
      }

      // Витрата — в звіт майстра не йде. Навіть якщо якось прив'язана
      // до майстра — це салонна операція.
      if (expense !== 0) continue;

      const metrics = computeRowMetrics(f);
      const serviceShare = metrics.masterPayForService;
      const materialShare = metrics.masterPayForMaterials;
      const salesShare = (f[SERVICE_FIELDS.fixedMasterPctForSale] as number) || 0;

      // Якщо є serviceLinks або materialShare/serviceShare > 0 → послуга/оренда.
      // Якщо тільки sales/saleDetails і salesShare → продаж.
      const hasService =
        (serviceLinks && serviceLinks.length > 0) ||
        serviceShare > 0 ||
        materialShare > 0;
      const hasSale =
        (saleLinks && saleLinks.length > 0) ||
        (saleDetailLinks && saleDetailLinks.length > 0) ||
        salesShare > 0;

      if (hasService) {
        const total = serviceShare + materialShare;
        accruedServicesOnly += serviceShare;
        accruedMaterials += materialShare;
        accruedServices += total;
        countServices += 1;
        // title: назва послуги з каталогу якщо є, інакше "Послуга"
        let title = "Послуга";
        if (serviceLinks && serviceLinks.length > 0) {
          const names = serviceLinks
            .map((id) => serviceNameById.get(id))
            .filter(Boolean);
          if (names.length > 0) title = names.join(", ");
        }
        entries.push({
          id: r.id,
          date,
          type: "service",
          title,
          amount: total,
          comment,
        });
      } else if (hasSale) {
        accruedSales += salesShare;
        countSales += 1;
        entries.push({
          id: r.id,
          date,
          type: "sale",
          title: "Продаж товарів",
          amount: salesShare,
          comment,
        });
      }
      // else — невідомий тип запису. Ігноруємо тихо (може бути broken row).
    }

    const accruedTotal = accruedServices + accruedSales;
    // Залишок за період: нарахували − виплатили + довнесли (рідко).
    // Якщо payout відбулись за попередній період, це тут не врахується —
    // і так має бути, звіт показує рух грошей саме за обраний діапазон.
    const remaining = accruedTotal - paidOutAbs + contributed;

    const settingsFields = settingsRecords[0]?.fields ?? {};
    return NextResponse.json({
      salon: {
        name: (settingsFields[SETTINGS_FIELDS.name] as string) || "Салон",
        currency:
          (settingsFields[SETTINGS_FIELDS.currency] as string) || "UAH",
        timezone:
          (settingsFields[SETTINGS_FIELDS.timezone] as string) ||
          "Europe/Kyiv",
        specialistTerm:
          (settingsFields[SETTINGS_FIELDS.specialistTerm] as string) ||
          "Майстер",
        brandColor:
          (settingsFields[SETTINGS_FIELDS.brandColor] as string) || "#9333ea",
      },
      specialist: {
        id: specRecord.id,
        name: (specFields[SPECIALIST_FIELDS.name] as string) || "",
        compensationLabel,
      },
      period: { from, to },
      accrued: {
        services: accruedServicesOnly,
        materials: accruedMaterials,
        sales: accruedSales,
        total: accruedTotal,
        countServices,
        countSales,
      },
      paid: {
        total: paidOutAbs,
        count: countPaid,
      },
      contributed: {
        total: contributed,
      },
      remaining,
      entries,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to build master report:", error);
    return NextResponse.json(
      { error: "Failed to build report" },
      { status: 500 },
    );
  }
}
