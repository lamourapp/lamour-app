import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, fetchRecords, createRecord, deleteRecord, TABLES } from "@/lib/airtable";

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

    // Fetch journal, specialists, services, price list, and sale details in parallel
    const [records, specialistRecords, serviceCatalog, priceList, saleDetailRecords, categoryRecords] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: dateFilter,
        sort: [{ field: "Дата", direction: "desc" }],
        fields: [
          "Дата",
          "Майстер",
          "Послуга",
          "Всього вартість послуги",
          "Доповнення",
          "Салону за послугу",
          "Оплата майстру - всього",
          "Сума витрат",
          "Вид витрати",
          "Cума боргу",
          "Продажі",
          "Продажі деталі",
          "Всього ціна продажі",
          "Доповнення(продажі)",
          "Created",
          "вид оплати",
          "Коментарі",
          "Загальна вартість роботи",
          "Загальна вартість матеріалів",
          "% майстру за послуги",
          "% майстру за матеріали",
          "% салону за матеріали",
          "Фікс. % майстру за продаж",
          "Фікс. % салону за продаж",
          "Додаткові матеріали(Калькуляція)",
          "Фікс. вартість матеріалів",
          "Фікс. оплата майстру за послугу",
        ],
      }),
      fetchAllRecords(TABLES.specialists, { fields: ["Ім'я"] }),
      fetchAllRecords(TABLES.servicesCatalog, { fields: ["Назва", "Категорія"] }),
      fetchAllRecords(TABLES.priceList, { fields: ["Назва"] }),
      fetchAllRecords(TABLES.saleDetails, { fields: ["к-сть", "Прайс", "Фікс. ціна продажу", "До оплати"] }),
      fetchAllRecords(TABLES.categories, { fields: ["isRental"] }),
    ]);

    // Build lookup maps
    const specialistMap = new Map<string, string>();
    specialistRecords.forEach((r) => specialistMap.set(r.id, (r.fields["Ім'я"] as string) || ""));

    const serviceMap = new Map<string, string>();
    serviceCatalog.forEach((r) => serviceMap.set(r.id, (r.fields["Назва"] as string) || ""));

    // Build serviceId → isRental map via Категорії (single source of truth,
    // replaces legacy title.includes("оренда") detection).
    const rentalCategoryIds = new Set<string>();
    categoryRecords.forEach((r) => {
      if (r.fields["isRental"] === true) rentalCategoryIds.add(r.id);
    });
    const rentalServiceIds = new Set<string>();
    serviceCatalog.forEach((r) => {
      const catLinks = r.fields["Категорія"] as string[] | undefined;
      if (catLinks && catLinks.some((id) => rentalCategoryIds.has(id))) {
        rentalServiceIds.add(r.id);
      }
    });

    const priceMap = new Map<string, string>();
    priceList.forEach((r) => priceMap.set(r.id, (r.fields["Назва"] as string) || ""));

    // Build sale details map: detailId → { productName, quantity, lineTotal }
    const saleDetailMap = new Map<string, { productName: string; quantity: number; lineTotal: number }>();
    saleDetailRecords.forEach((r) => {
      const priceLinks = r.fields["Прайс"] as string[] | undefined;
      const productName = priceLinks && priceLinks.length > 0 ? (priceMap.get(priceLinks[0]) || "") : "";
      saleDetailMap.set(r.id, {
        productName,
        quantity: (r.fields["к-сть"] as number) || 1,
        lineTotal: (r.fields["До оплати"] as number) || (r.fields["Фікс. ціна продажу"] as number) || 0,
      });
    });

    let entries = records.map((r) => {
      const f = r.fields;

      // Determine type
      let type: "service" | "sale" | "expense" | "rental" | "debt" = "service";
      const expenseAmount = f["Сума витрат"] as number | undefined;
      const debtAmount = f["Cума боргу"] as number | undefined;
      const salesLinks = f["Продажі"] as string[] | undefined;
      const serviceLinks = f["Послуга"] as string[] | undefined;

      if (expenseAmount && expenseAmount !== 0) {
        type = "expense";
      } else if (debtAmount && debtAmount !== 0) {
        type = "debt";
      } else if (salesLinks && salesLinks.length > 0 && (!serviceLinks || serviceLinks.length === 0)) {
        type = "sale";
      }

      // Get specialist
      const masterLinks = f["Майстер"] as string[] | undefined;
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
      const detailLinks = f["Продажі деталі"] as string[] | undefined;
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
        title = (f["Вид витрати"] as string) || "Витрата";
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
        amount = (f["Всього ціна продажі"] as number) || 0;
      } else if (type === "rental") {
        // For rental: show total but pass breakdown (rental fee + materials)
        amount = (f["Всього вартість послуги"] as number) || 0;
        const matCost = (f["Загальна вартість матеріалів"] as number) || 0;
        if (matCost > 0) {
          materialsCost = matCost;
        }
      } else {
        amount = (f["Всього вартість послуги"] as number) || 0;
      }

      // Source — all records now come from PWA (bot not connected to this base)
      const source = "admin";

      // Time from Created, formatted in the tenant's timezone.
      // `Created` is always a UTC ISO string from Airtable; Intl handles the shift.
      let time = "";
      const created = f["Created"] as string;
      if (created) {
        time = timeFormatter.format(new Date(created));
      }

      return {
        id: r.id,
        date: (f["Дата"] as string) || "",
        type,
        title,
        specialistId: specialistRecId,
        specialistName,
        amount,
        supplement: (f["Доповнення"] as number) || (f["Доповнення(продажі)"] as number) || undefined,
        // Service-side aggregates. For sales these are 0/undefined —
        // the sale split lives in specialistSalesShare/salonSalesShare.
        specialistShare: type === "sale" ? undefined : ((f["Оплата майстру - всього"] as number) || undefined),
        salonShare: type === "sale" ? undefined : ((f["Салону за послугу"] as number) || undefined),
        // Detailed breakdowns for dashboard
        specialistServiceShare: (f["% майстру за послуги"] as number) || undefined,
        specialistMaterialShare: (f["% майстру за матеріали"] as number) || undefined,
        specialistSalesShare: (f["Фікс. % майстру за продаж"] as number) || undefined,
        salonMaterialShare: (f["% салону за матеріали"] as number) || undefined,
        salonSalesShare: (f["Фікс. % салону за продаж"] as number) || undefined,
        materialsCost,
        comment: (f["Коментарі"] as string) || undefined,
        // Калькуляція = base materials from service catalog (fixed/snapshot)
        calculationCost: (f["Фікс. вартість матеріалів"] as number) || undefined,
        // Матеріали = extra materials added (total materials minus base)
        // For rental: all materials are "extra" (rental service has no base materials)
        baseMaterialsCost: (() => {
          const total = (f["Загальна вартість матеріалів"] as number) || 0;
          const base = (f["Фікс. вартість матеріалів"] as number) || 0;
          const extra = total - base;
          return extra > 0 ? extra : undefined;
        })(),
        saleItems: saleItems && saleItems.length > 1 ? saleItems : undefined,
        source,
        time,
        paymentType: (f["вид оплати"] as string) || undefined,
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
      "Дата": date,
    };

    if (comment) fields["Коментарі"] = comment;
    if (specialistId) fields["Майстер"] = [specialistId];

    switch (type) {
      case "expense":
        if (!amount) return NextResponse.json({ error: "amount is required" }, { status: 400 });
        fields["Сума витрат"] = Math.abs(amount);
        if (body.expenseType) fields["Вид витрати"] = body.expenseType;
        break;

      case "debt":
        if (amount === undefined) return NextResponse.json({ error: "amount is required" }, { status: 400 });
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        fields["Cума боргу"] = amount; // + ми винні, - нам винні
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
              "к-сть": item.quantity,
              "Прайс": [item.productId],
              "Фікс. ціна продажу": item.salePrice,
              "Фікс. ціна закупки": item.costPrice,
              "До оплати": lineTotal,
            });
            detailIds.push(detail.id);
            if (!productIds.includes(item.productId)) productIds.push(item.productId);
            totalSalePrice += lineTotal;
            totalCostPrice += lineCost;
          }

          if (detailIds.length === 0) return NextResponse.json({ error: "No valid sale items" }, { status: 400 });

          fields["Продажі деталі"] = detailIds;
          fields["Продажі"] = productIds;
          fields["Фікс. ціна продажу"] = totalSalePrice;
          fields["Фікс. ціна закупки"] = totalCostPrice;
        } else if (body.productId) {
          // Legacy single-product sale (backward compat)
          fields["Продажі"] = [body.productId];
          if (body.salePrice) fields["Фікс. ціна продажу"] = body.salePrice;
          if (body.costPrice) fields["Фікс. ціна закупки"] = body.costPrice;
        } else {
          return NextResponse.json({ error: "saleItems or productId is required" }, { status: 400 });
        }

        if (body.supplement) fields["Доповнення(продажі)"] = body.supplement;

        // Calculate specialist/salon split based on specialist's "% за продаж"
        const totalSaleAmount = (fields["Фікс. ціна продажу"] as number) || 0;
        const supplement = body.supplement || 0;
        const saleTotal = totalSaleAmount + supplement;
        if (specialistId && saleTotal > 0) {
          // Fetch specialist's sales commission rate
          const specResult = await fetchRecords(TABLES.specialists, {
            filterByFormula: `RECORD_ID()='${specialistId}'`,
            fields: ["% за продаж"],
            maxRecords: 1,
          });
          const specRate = specResult.records.length > 0
            ? (specResult.records[0].fields["% за продаж"] as number) || 0
            : 0;
          const specialistAmount = Math.round(saleTotal * specRate / 100);
          const salonAmount = saleTotal - specialistAmount;
          fields["Фікс. % майстру за продаж"] = specialistAmount;
          fields["Фікс. % салону за продаж"] = salonAmount;
        }
        break;
      }

      case "service": {
        if (!body.serviceId) return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        fields["Послуга"] = [body.serviceId];
        // Fixed values from catalog (formulas use these, not lookups)
        if (body.fixedPrice !== undefined) fields["Фіксована вартість"] = body.fixedPrice;
        if (body.hourlyRate !== undefined) fields["Фікс. вартість години"] = body.hourlyRate;
        if (body.materialsCost !== undefined) fields["Фікс. вартість матеріалів"] = body.materialsCost;
        // Snapshot of materials purchase cost from catalog (ex-formula {продажа}*0.55,
        // now editable per-service `закупка` in Список послуг).
        if (body.materialsPurchaseCost !== undefined)
          fields["вартість матеріалів закупка (from Послуга)"] = body.materialsPurchaseCost;
        if (body.masterHourlyPay !== undefined) fields["Фікс. оплата майстру за послугу"] = body.masterHourlyPay;
        if (body.supplement) fields["Доповнення"] = body.supplement;
        if (body.extraHours) fields["Додаткові години"] = body.extraHours;
        if (body.extraMaterialsCost) fields["Додаткові матеріали(Калькуляція)"] = body.extraMaterialsCost;
        if (body.paymentType) fields["вид оплати"] = body.paymentType;

        // If product is sold alongside
        if (body.productId) {
          fields["Продажі"] = [body.productId];
          if (body.productSupplement) fields["Доповнення(продажі)"] = body.productSupplement;
          if (body.salePrice) fields["Фікс. ціна продажу"] = body.salePrice;
          if (body.costPrice) fields["Фікс. ціна закупки"] = body.costPrice;
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
                "мл/шт": mat.amount,
                "Калькуляція": [mat.materialId],
              });
              orderIds.push(order.id);

              // Purchase cost: amount × cost per unit (sent as snapshot from client)
              if (mat.costPerUnit != null && mat.costPerUnit > 0) {
                totalPurchaseCost += mat.amount * mat.costPerUnit;
              }
            }
          }
          if (orderIds.length > 0) {
            fields["Замовлення"] = orderIds;
          }
          if (totalPurchaseCost > 0) {
            fields["Фікс. собівартість матеріалів"] = Math.round(totalPurchaseCost);
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

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id || typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    // Fetch linked sale details + orders so we can cascade-delete them.
    // (Airtable won't orphan-clean linked records when the parent is deleted.)
    const parent = await fetchRecords(TABLES.services, {
      filterByFormula: `RECORD_ID()='${id}'`,
      fields: ["Продажі деталі", "Замовлення"],
      maxRecords: 1,
    });
    const parentFields = parent.records[0]?.fields ?? {};
    const detailIds = (parentFields["Продажі деталі"] as string[] | undefined) ?? [];
    const orderIds = (parentFields["Замовлення"] as string[] | undefined) ?? [];

    // Delete parent first (unlinks children so their deletion is permitted)
    await deleteRecord(TABLES.services, id);

    // Best-effort cleanup of child records. Log but don't fail the request.
    await Promise.all([
      ...detailIds.map((did) =>
        deleteRecord(TABLES.saleDetails, did).catch((err) =>
          console.error(`Failed to delete sale detail ${did}:`, err),
        ),
      ),
      ...orderIds.map((oid) =>
        deleteRecord(TABLES.orders, oid).catch((err) =>
          console.error(`Failed to delete order ${oid}:`, err),
        ),
      ),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete record:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
