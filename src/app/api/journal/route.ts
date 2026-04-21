import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, fetchRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import {
  SERVICE_FIELDS,
  SPECIALIST_FIELDS,
  SERVICE_CATALOG_FIELDS,
  PRICE_LIST_FIELDS,
  SALE_DETAIL_FIELDS,
  CATEGORY_FIELDS,
  ORDER_FIELDS,
} from "@/lib/airtable-fields";

// Intl.DateTimeFormat constructor is surprisingly slow; cache per tz so each
// request with the same tz reuses the formatter across invocations.
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getTimeFormatter(tz: string): Intl.DateTimeFormat {
  const cached = timeFormatterCache.get(tz);
  if (cached) return cached;
  try {
    const fmt = new Intl.DateTimeFormat("uk-UA", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    timeFormatterCache.set(tz, fmt);
    return fmt;
  } catch {
    return getTimeFormatter("Europe/Kyiv");
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const specialistId = searchParams.get("specialist") || "";
    const dateFrom = searchParams.get("from") || "";
    const dateTo = searchParams.get("to") || "";
    const tz = searchParams.get("tz") || "Europe/Kyiv";
    // За замовчуванням ховаємо скасовані — journal UI передає ?includeCanceled=1
    // коли користувач хоче побачити архів і кнопки «Відновити».
    const includeCanceled = searchParams.get("includeCanceled") === "1";
    const timeFormatter = getTimeFormatter(tz);

    // Build date filter only — specialist filtering is done client-side
    // because Airtable linked record formula is unreliable with IDs
    let dateFilter = "";

    if (dateFrom && dateTo) {
      dateFilter = `AND(IS_AFTER({Дата}, DATEADD('${dateFrom}', -1, 'day')), IS_BEFORE({Дата}, DATEADD('${dateTo}', 1, 'day')))`;
    } else {
      switch (period) {
        case "today":
          dateFilter = `IS_SAME({Дата}, TODAY(), 'day')`;
          break;
        case "yesterday":
          dateFilter = `IS_SAME({Дата}, DATEADD(TODAY(), -1, 'day'), 'day')`;
          break;
        case "week":
          dateFilter = `IS_AFTER({Дата}, DATEADD(TODAY(), -7, 'day'))`;
          break;
        case "month": {
          const now = new Date();
          const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
          dateFilter = `IS_AFTER({Дата}, DATEADD('${firstOfMonth}', -1, 'day'))`;
          break;
        }
        default:
          dateFilter = `IS_AFTER({Дата}, DATEADD(TODAY(), -30, 'day'))`;
      }
    }

    // Exclude canceled (soft-deleted) записи за замовчуванням.
    // Airtable: пуста checkbox = "" (falsy), поставлена = 1. NOT({isCanceled})
    // ловить обидва «не скасовано» стани.
    if (!includeCanceled) {
      dateFilter = `AND(${dateFilter}, NOT({isCanceled}))`;
    }

    // Fetch journal, specialists, services, price list, and sale details in parallel
    const [records, specialistRecords, serviceCatalog, priceList, saleDetailRecords, categoryRecords] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: dateFilter,
        sort: [{ field: SERVICE_FIELDS.date, direction: "desc" }],
        fields: [
          SERVICE_FIELDS.date,
          SERVICE_FIELDS.master,
          SERVICE_FIELDS.service,
          SERVICE_FIELDS.totalServicePrice,
          SERVICE_FIELDS.addonServicePrice,
          SERVICE_FIELDS.salonForService,
          SERVICE_FIELDS.masterPayTotal,
          SERVICE_FIELDS.expenseAmount,
          SERVICE_FIELDS.expenseType,
          SERVICE_FIELDS.debtAmount,
          SERVICE_FIELDS.sales,
          SERVICE_FIELDS.saleDetails,
          SERVICE_FIELDS.totalSalePrice,
          SERVICE_FIELDS.addonSalePrice,
          SERVICE_FIELDS.created,
          SERVICE_FIELDS.paymentType,
          SERVICE_FIELDS.comments,
          SERVICE_FIELDS.totalWorkCost,
          SERVICE_FIELDS.totalMaterialsCost,
          SERVICE_FIELDS.masterPctForServices,
          SERVICE_FIELDS.masterPctForMaterials,
          SERVICE_FIELDS.salonPctForMaterials,
          SERVICE_FIELDS.fixedMasterPctForSale,
          SERVICE_FIELDS.fixedSalonPctForSale,
          SERVICE_FIELDS.additionalMaterials,
          SERVICE_FIELDS.fixedMaterialsCost,
          SERVICE_FIELDS.fixedMasterPayForService,
          SERVICE_FIELDS.isCanceled,
        ],
      }),
      fetchAllRecords(TABLES.specialists, { fields: [SPECIALIST_FIELDS.name] }),
      fetchAllRecords(TABLES.servicesCatalog, { fields: [SERVICE_CATALOG_FIELDS.name, SERVICE_CATALOG_FIELDS.category] }),
      fetchAllRecords(TABLES.priceList, { fields: [PRICE_LIST_FIELDS.name] }),
      fetchAllRecords(TABLES.saleDetails, { fields: [SALE_DETAIL_FIELDS.quantity, SALE_DETAIL_FIELDS.priceListItem, SALE_DETAIL_FIELDS.fixedSalePrice, SALE_DETAIL_FIELDS.totalDue] }),
      fetchAllRecords(TABLES.categories, { fields: [CATEGORY_FIELDS.isRental] }),
    ]);

    // Build lookup maps
    const specialistMap = new Map<string, string>();
    specialistRecords.forEach((r) => specialistMap.set(r.id, (r.fields[SPECIALIST_FIELDS.name] as string) || ""));

    const serviceMap = new Map<string, string>();
    serviceCatalog.forEach((r) => serviceMap.set(r.id, (r.fields[SERVICE_CATALOG_FIELDS.name] as string) || ""));

    // Build serviceId → isRental map via Категорії (single source of truth,
    // replaces legacy title.includes("оренда") detection).
    const rentalCategoryIds = new Set<string>();
    categoryRecords.forEach((r) => {
      if (r.fields[CATEGORY_FIELDS.isRental] === true) rentalCategoryIds.add(r.id);
    });
    const rentalServiceIds = new Set<string>();
    serviceCatalog.forEach((r) => {
      const catLinks = r.fields[SERVICE_CATALOG_FIELDS.category] as string[] | undefined;
      if (catLinks && catLinks.some((id) => rentalCategoryIds.has(id))) {
        rentalServiceIds.add(r.id);
      }
    });

    const priceMap = new Map<string, string>();
    priceList.forEach((r) => priceMap.set(r.id, (r.fields[PRICE_LIST_FIELDS.name] as string) || ""));

    // Build sale details map: detailId → { productName, quantity, lineTotal }
    const saleDetailMap = new Map<string, { productName: string; quantity: number; lineTotal: number }>();
    saleDetailRecords.forEach((r) => {
      const priceLinks = r.fields[SALE_DETAIL_FIELDS.priceListItem] as string[] | undefined;
      const productName = priceLinks && priceLinks.length > 0 ? (priceMap.get(priceLinks[0]) || "") : "";
      saleDetailMap.set(r.id, {
        productName,
        quantity: (r.fields[SALE_DETAIL_FIELDS.quantity] as number) || 1,
        lineTotal: (r.fields[SALE_DETAIL_FIELDS.totalDue] as number) || (r.fields[SALE_DETAIL_FIELDS.fixedSalePrice] as number) || 0,
      });
    });

    let entries = records.map((r) => {
      const f = r.fields;

      // Determine type
      let type: "service" | "sale" | "expense" | "rental" | "debt" = "service";
      const expenseAmount = f[SERVICE_FIELDS.expenseAmount] as number | undefined;
      const debtAmount = f[SERVICE_FIELDS.debtAmount] as number | undefined;
      const salesLinks = f[SERVICE_FIELDS.sales] as string[] | undefined;
      const serviceLinks = f[SERVICE_FIELDS.service] as string[] | undefined;

      if (expenseAmount && expenseAmount !== 0) {
        type = "expense";
      } else if (debtAmount && debtAmount !== 0) {
        type = "debt";
      } else if (salesLinks && salesLinks.length > 0 && (!serviceLinks || serviceLinks.length === 0)) {
        type = "sale";
      }

      // Get specialist
      const masterLinks = f[SERVICE_FIELDS.master] as string[] | undefined;
      let specialistName = "";
      let specialistRecId = "";
      if (masterLinks && masterLinks.length > 0) {
        specialistRecId = masterLinks[0];
        specialistName = specialistMap.get(masterLinks[0]) || "";
      }

      // Get service name
      let title = "";
      if (serviceLinks && serviceLinks.length > 0) {
        title = serviceMap.get(serviceLinks[0]) || "";
      }

      // Get product name for sales + build saleItems from detail records
      const detailLinks = f[SERVICE_FIELDS.saleDetails] as string[] | undefined;
      let saleItems: { productName: string; quantity: number; lineTotal: number }[] | undefined;

      if (type === "sale") {
        if (detailLinks && detailLinks.length > 0) {
          // New multi-product format: build from detail records
          saleItems = detailLinks
            .map((id) => saleDetailMap.get(id))
            .filter((d): d is NonNullable<typeof d> => !!d && !!d.productName);
          if (saleItems.length > 0) {
            title = saleItems[0].productName;
            if (saleItems.length > 1) {
              title += ` +${saleItems.length - 1}`;
            }
          } else {
            title = salesLinks && salesLinks.length > 0 ? (priceMap.get(salesLinks[0]) || "Продаж") : "Продаж";
          }
        } else if (salesLinks && salesLinks.length > 0) {
          // Legacy single-product format
          title = priceMap.get(salesLinks[0]) || "Продаж";
        }
      }

      // Also show product alongside service if both exist
      if (type === "service" && salesLinks && salesLinks.length > 0) {
        const productName = priceMap.get(salesLinks[0]) || "";
        if (productName && title) {
          title = `${title} + ${productName}`;
        }
      }

      // Rental detection via linked service → category.isRental (set explicitly
      // на Категорії.isRental). Безпечно до перейменування назв.
      if (serviceLinks && serviceLinks.some((id) => rentalServiceIds.has(id))) {
        type = "rental";
      }

      // For expenses, use type as title
      if (type === "expense") {
        title = (f[SERVICE_FIELDS.expenseType] as string) || "Витрата";
      }

      // For debts
      if (type === "debt" && !title) {
        title = "Борг";
      }

      // Amount
      let amount = 0;
      let materialsCost: number | undefined;
      if (type === "expense") {
        amount = -(Math.abs(expenseAmount || 0));
      } else if (type === "debt") {
        amount = debtAmount || 0;
      } else if (type === "sale") {
        amount = (f[SERVICE_FIELDS.totalSalePrice] as number) || 0;
      } else if (type === "rental") {
        // For rental: show total but pass breakdown (rental fee + materials)
        amount = (f[SERVICE_FIELDS.totalServicePrice] as number) || 0;
        const matCost = (f[SERVICE_FIELDS.totalMaterialsCost] as number) || 0;
        if (matCost > 0) {
          materialsCost = matCost;
        }
      } else {
        amount = (f[SERVICE_FIELDS.totalServicePrice] as number) || 0;
      }

      // Source — all records now come from PWA (bot not connected to this base)
      const source = "admin";

      // Time from Created, formatted in the tenant's timezone.
      // `Created` is always a UTC ISO string from Airtable; Intl handles the shift.
      let time = "";
      const created = f[SERVICE_FIELDS.created] as string;
      if (created) {
        time = timeFormatter.format(new Date(created));
      }

      return {
        id: r.id,
        date: (f[SERVICE_FIELDS.date] as string) || "",
        type,
        title,
        specialistId: specialistRecId,
        specialistName,
        amount,
        supplement: (f[SERVICE_FIELDS.addonServicePrice] as number) || (f[SERVICE_FIELDS.addonSalePrice] as number) || undefined,
        // Service-side aggregates. For sales these are 0/undefined —
        // the sale split lives in specialistSalesShare/salonSalesShare.
        specialistShare: type === "sale" ? undefined : ((f[SERVICE_FIELDS.masterPayTotal] as number) || undefined),
        salonShare: type === "sale" ? undefined : ((f[SERVICE_FIELDS.salonForService] as number) || undefined),
        // Detailed breakdowns for dashboard
        specialistServiceShare: (f[SERVICE_FIELDS.masterPctForServices] as number) || undefined,
        specialistMaterialShare: (f[SERVICE_FIELDS.masterPctForMaterials] as number) || undefined,
        specialistSalesShare: (f[SERVICE_FIELDS.fixedMasterPctForSale] as number) || undefined,
        salonMaterialShare: (f[SERVICE_FIELDS.salonPctForMaterials] as number) || undefined,
        salonSalesShare: (f[SERVICE_FIELDS.fixedSalonPctForSale] as number) || undefined,
        materialsCost,
        comment: (f[SERVICE_FIELDS.comments] as string) || undefined,
        // Калькуляція = base materials from service catalog (fixed/snapshot)
        calculationCost: (f[SERVICE_FIELDS.fixedMaterialsCost] as number) || undefined,
        // Матеріали = extra materials added (total materials minus base)
        // For rental: all materials are "extra" (rental service has no base materials)
        baseMaterialsCost: (() => {
          const total = (f[SERVICE_FIELDS.totalMaterialsCost] as number) || 0;
          const base = (f[SERVICE_FIELDS.fixedMaterialsCost] as number) || 0;
          const extra = total - base;
          return extra > 0 ? extra : undefined;
        })(),
        saleItems: saleItems && saleItems.length > 1 ? saleItems : undefined,
        source,
        time,
        paymentType: (f[SERVICE_FIELDS.paymentType] as string) || undefined,
        // Експозим для edit-modal: treba zrozumity який «Вид витрати» був у записі.
        expenseType: type === "expense" ? ((f[SERVICE_FIELDS.expenseType] as string) || undefined) : undefined,
        // Прапорець soft-delete. Нормально не виставлений (ми фільтруємо),
        // але коли клієнт просить ?includeCanceled=1 — треба знати, які
        // записи показати сірим і з кнопкою «Відновити».
        isCanceled: f[SERVICE_FIELDS.isCanceled] === true ? true : undefined,
      };
    });

    // Client-side specialist filter (Airtable formula doesn't work with record IDs in linked fields)
    if (specialistId) {
      entries = entries.filter((e) => e.specialistId === specialistId);
    }

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Failed to fetch journal:", error);
    return NextResponse.json({ error: "Failed to fetch journal" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, date, amount, specialistId, comment } = body;

    if (!type || !date) {
      return NextResponse.json({ error: "type and date are required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {
      [SERVICE_FIELDS.date]: date,
    };

    if (comment) fields[SERVICE_FIELDS.comments] = comment;
    if (specialistId) fields[SERVICE_FIELDS.master] = [specialistId];

    switch (type) {
      case "expense":
        if (!amount) return NextResponse.json({ error: "amount is required" }, { status: 400 });
        fields[SERVICE_FIELDS.expenseAmount] = Math.abs(amount);
        if (body.expenseType) fields[SERVICE_FIELDS.expenseType] = body.expenseType;
        break;

      case "debt":
        if (amount === undefined) return NextResponse.json({ error: "amount is required" }, { status: 400 });
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        fields[SERVICE_FIELDS.debtAmount] = amount; // + ми винні, - нам винні
        break;

      case "sale": {
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        const saleItems = body.saleItems as { productId: string; quantity: number; salePrice: number; costPrice: number }[] | undefined;

        if (saleItems && saleItems.length > 0) {
          // Multi-product sale: create detail records, sum totals
          const detailIds: string[] = [];
          const productIds: string[] = [];
          let totalSalePrice = 0;
          let totalCostPrice = 0;

          for (const item of saleItems) {
            if (!item.productId || item.quantity <= 0) continue;
            const lineTotal = item.salePrice * item.quantity;
            const lineCost = item.costPrice * item.quantity;
            const detail = await createRecord(TABLES.saleDetails, {
              [SALE_DETAIL_FIELDS.quantity]: item.quantity,
              [SALE_DETAIL_FIELDS.priceListItem]: [item.productId],
              [SALE_DETAIL_FIELDS.fixedSalePrice]: item.salePrice,
              [SALE_DETAIL_FIELDS.fixedCostPrice]: item.costPrice,
              [SALE_DETAIL_FIELDS.totalDue]: lineTotal,
            });
            detailIds.push(detail.id);
            if (!productIds.includes(item.productId)) productIds.push(item.productId);
            totalSalePrice += lineTotal;
            totalCostPrice += lineCost;
          }

          if (detailIds.length === 0) return NextResponse.json({ error: "No valid sale items" }, { status: 400 });

          fields[SERVICE_FIELDS.saleDetails] = detailIds;
          fields[SERVICE_FIELDS.sales] = productIds;
          fields[SERVICE_FIELDS.fixedSalePrice] = totalSalePrice;
          fields[SERVICE_FIELDS.fixedCostPrice] = totalCostPrice;
        } else if (body.productId) {
          // Legacy single-product sale (backward compat)
          fields[SERVICE_FIELDS.sales] = [body.productId];
          if (body.salePrice) fields[SERVICE_FIELDS.fixedSalePrice] = body.salePrice;
          if (body.costPrice) fields[SERVICE_FIELDS.fixedCostPrice] = body.costPrice;
        } else {
          return NextResponse.json({ error: "saleItems or productId is required" }, { status: 400 });
        }

        if (body.supplement) fields[SERVICE_FIELDS.addonSalePrice] = body.supplement;

        // Calculate specialist/salon split based on specialist's "% за продаж"
        const totalSaleAmount = (fields[SERVICE_FIELDS.fixedSalePrice] as number) || 0;
        const supplement = body.supplement || 0;
        const saleTotal = totalSaleAmount + supplement;
        if (specialistId && saleTotal > 0) {
          // Fetch specialist's sales commission rate
          const specResult = await fetchRecords(TABLES.specialists, {
            filterByFormula: `RECORD_ID()='${specialistId}'`,
            fields: [SPECIALIST_FIELDS.masterPctForSale],
            maxRecords: 1,
          });
          const specRate = specResult.records.length > 0
            ? (specResult.records[0].fields[SPECIALIST_FIELDS.masterPctForSale] as number) || 0
            : 0;
          const specialistAmount = Math.round(saleTotal * specRate / 100);
          const salonAmount = saleTotal - specialistAmount;
          fields[SERVICE_FIELDS.fixedMasterPctForSale] = specialistAmount;
          fields[SERVICE_FIELDS.fixedSalonPctForSale] = salonAmount;
        }
        break;
      }

      case "service": {
        if (!body.serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        fields[SERVICE_FIELDS.service] = [body.serviceId];
        // Fixed values from catalog (formulas use these, not lookups)
        if (body.fixedPrice !== undefined) fields[SERVICE_FIELDS.fixedPrice] = body.fixedPrice;
        if (body.hourlyRate !== undefined) fields[SERVICE_FIELDS.fixedHourlyRate] = body.hourlyRate;
        if (body.materialsCost !== undefined) fields[SERVICE_FIELDS.fixedMaterialsCost] = body.materialsCost;
        // Snapshot of materials purchase cost from catalog (ex-formula {продажа}*0.55,
        // now editable per-service `закупка` in Список послуг).
        if (body.materialsPurchaseCost !== undefined)
          fields[SERVICE_FIELDS.materialsPurchaseCostFromService] = body.materialsPurchaseCost;
        if (body.masterHourlyPay !== undefined) fields[SERVICE_FIELDS.fixedMasterPayForService] = body.masterHourlyPay;
        if (body.supplement) fields[SERVICE_FIELDS.addonServicePrice] = body.supplement;
        if (body.extraHours) fields["Додаткові години"] = body.extraHours; // TODO: add to airtable-fields.ts
        if (body.extraMaterialsCost) fields[SERVICE_FIELDS.additionalMaterials] = body.extraMaterialsCost;
        if (body.paymentType) fields[SERVICE_FIELDS.paymentType] = body.paymentType;

        // If product is sold alongside
        if (body.productId) {
          fields[SERVICE_FIELDS.sales] = [body.productId];
          if (body.productSupplement) fields[SERVICE_FIELDS.addonSalePrice] = body.productSupplement;
          if (body.salePrice) fields[SERVICE_FIELDS.fixedSalePrice] = body.salePrice;
          if (body.costPrice) fields[SERVICE_FIELDS.fixedCostPrice] = body.costPrice;
        }

        // Create Замовлення (order) records for calculation materials.
        // Client sends costPerUnit + totalVolume so we can compute purchase cost
        // without an extra Airtable round-trip.
        const calcMaterials = body.calcMaterials as {
          materialId: string;
          amount: number;
          costPerUnit?: number; // закупка / Всього мл/шт
        }[] | undefined;

        if (calcMaterials && calcMaterials.length > 0) {
          const orderIds: string[] = [];
          let totalPurchaseCost = 0;

          for (const mat of calcMaterials) {
            if (mat.amount > 0) {
              const order = await createRecord(TABLES.orders, {
                [ORDER_FIELDS.quantity]: mat.amount,
                [ORDER_FIELDS.material]: [mat.materialId],
              });
              orderIds.push(order.id);

              // Purchase cost: amount × cost per unit (sent as snapshot from client)
              if (mat.costPerUnit != null && mat.costPerUnit > 0) {
                totalPurchaseCost += mat.amount * mat.costPerUnit;
              }
            }
          }
          if (orderIds.length > 0) {
            fields[SERVICE_FIELDS.orders] = orderIds;
          }
          if (totalPurchaseCost > 0) {
            fields[SERVICE_FIELDS.fixedMaterialsCostPrice] = Math.round(totalPurchaseCost);
          }
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const result = await createRecord(TABLES.services, fields);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create record:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Редагування запису журналу. Наразі підтримуємо лише витрати (expense) —
 * послуги/продажі мають складні пов'язані side-effects (saleDetails, orders),
 * їх простіше видалити й створити наново.
 *
 * Body: { id, kind: "expense", date?, amount?, expenseType?, specialistId?, comment? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, kind } = body;
    if (!id || typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }
    if (kind !== "expense") {
      return NextResponse.json(
        { error: "Only expense entries are editable. Delete & recreate for services/sales/debts." },
        { status: 400 },
      );
    }

    const fields: Record<string, unknown> = {};
    if (body.date !== undefined) fields[SERVICE_FIELDS.date] = body.date;
    if (body.amount !== undefined) {
      const amt = Number(body.amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
      }
      fields[SERVICE_FIELDS.expenseAmount] = Math.abs(amt);
    }
    if (body.expenseType !== undefined) {
      // Empty string → clear category; non-empty → set.
      fields[SERVICE_FIELDS.expenseType] = body.expenseType || null;
    }
    if (body.comment !== undefined) {
      fields[SERVICE_FIELDS.comments] = body.comment || null;
    }
    if (body.specialistId !== undefined) {
      // Empty → unlink; non-empty → link single specialist.
      fields[SERVICE_FIELDS.master] = body.specialistId ? [body.specialistId] : [];
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    await updateRecord(TABLES.services, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update journal entry:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Soft-delete: ставить {isCanceled}=true замість фізичного видалення.
 *
 * Чому soft: hard-delete у середині звітного періоду змінює історичні числа
 * (вчорашня каса) — власник дивиться на дашборд і бачить іншу цифру, ніж
 * учора. Збереження рядка з прапорцем дозволяє:
 *   - фільтрувати з поточних GET-ів (каса/журнал/дашборд) — ефект як delete
 *   - відновити випадкове скасування (PATCH isCanceled=false)
 *   - у майбутньому — заблокувати скасування для дат старших за N днів
 *
 * Linked saleDetails/orders лишаються прив'язаними — ми їх бачимо тільки
 * через батьківський рядок, який тепер прихований. Якщо колись знадобиться
 * реальне видалення — окремий admin-endpoint.
 *
 * Body: { id, restore?: boolean } — restore=true → isCanceled=false
 */
export async function DELETE(request: NextRequest) {
  try {
    const { id, restore } = await request.json();
    if (!id || typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    await updateRecord(TABLES.services, id, {
      [SERVICE_FIELDS.isCanceled]: restore === true ? false : true,
    });

    return NextResponse.json({ success: true, canceled: restore !== true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to soft-delete record:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
