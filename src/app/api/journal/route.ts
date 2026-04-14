import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, deleteRecord, TABLES } from "@/lib/airtable";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const specialistId = searchParams.get("specialist") || "";
    const dateFrom = searchParams.get("from") || "";
    const dateTo = searchParams.get("to") || "";

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

    // Fetch journal, specialists, services, and price list in parallel
    const [records, specialistRecords, serviceCatalog, priceList] = await Promise.all([
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
          "Всього ціна продажі",
          "Доповнення(продажі)",
          "Created",
          "Чатбот",
          "вид оплати",
          "Коментарі",
          "Загальна вартість роботи",
          "Загальна вартість матеріалів",
          "% майстру за послуги",
          "% майстру за матеріали",
          "% майстру за продаж",
          "% салону за матеріали",
          "% салону за продаж",
          "Додаткові матеріали(Калькуляція)",
        ],
      }),
      fetchAllRecords(TABLES.specialists, { fields: ["Ім'я"] }),
      fetchAllRecords(TABLES.servicesCatalog, { fields: ["Назва"] }),
      fetchAllRecords(TABLES.priceList, { fields: ["Назва"] }),
    ]);

    // Build lookup maps
    const specialistMap = new Map<string, string>();
    specialistRecords.forEach((r) => specialistMap.set(r.id, (r.fields["Ім'я"] as string) || ""));

    const serviceMap = new Map<string, string>();
    serviceCatalog.forEach((r) => serviceMap.set(r.id, (r.fields["Назва"] as string) || ""));

    const priceMap = new Map<string, string>();
    priceList.forEach((r) => priceMap.set(r.id, (r.fields["Назва"] as string) || ""));

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

      // Get product name for sales
      if (type === "sale" && salesLinks && salesLinks.length > 0) {
        title = priceMap.get(salesLinks[0]) || "Продаж";
      }

      // Also show product alongside service if both exist
      if (type === "service" && salesLinks && salesLinks.length > 0) {
        const productName = priceMap.get(salesLinks[0]) || "";
        if (productName && title) {
          title = `${title} + ${productName}`;
        }
      }

      // Check if rental
      if (title.toLowerCase().includes("оренда")) {
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
        const workCost = (f["Загальна вартість роботи"] as number) || 0;
        const matCost = (f["Загальна вартість матеріалів"] as number) || 0;
        if (matCost > 0) {
          materialsCost = matCost;
        }
      } else {
        amount = (f["Всього вартість послуги"] as number) || 0;
      }

      // Source
      const chatbot = f["Чатбот"] as string | undefined;
      const source = chatbot ? "bot" : "admin";

      // Time from Created
      let time = "";
      const created = f["Created"] as string;
      if (created) {
        const date = new Date(created);
        time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
        specialistShare: (f["Оплата майстру - всього"] as number) || undefined,
        salonShare: (f["Салону за послугу"] as number) || undefined,
        // Detailed breakdowns for dashboard
        specialistServiceShare: (f["% майстру за послуги"] as number) || undefined,
        specialistMaterialShare: (f["% майстру за матеріали"] as number) || undefined,
        specialistSalesShare: (f["% майстру за продаж"] as number) || undefined,
        salonMaterialShare: (f["% салону за матеріали"] as number) || undefined,
        salonSalesShare: (f["% салону за продаж"] as number) || undefined,
        materialsCost,
        comment: (f["Коментарі"] as string) || undefined,
        calculationCost: type !== "rental" ? ((f["Додаткові матеріали(Калькуляція)"] as number) || undefined) : undefined,
        baseMaterialsCost: (f["Загальна вартість матеріалів"] as number) || undefined,
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

      case "sale":
        if (!body.productId) return NextResponse.json({ error: "productId is required" }, { status: 400 });
        if (!specialistId) return NextResponse.json({ error: "specialistId is required" }, { status: 400 });
        fields["Продажі"] = [body.productId];
        if (body.supplement) fields["Доповнення(продажі)"] = body.supplement;
        break;

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

    await deleteRecord(TABLES.services, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to delete record:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
