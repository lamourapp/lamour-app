import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const period = searchParams.get("period") || "month";
    const specialistId = searchParams.get("specialist") || "";
    const dateFrom = searchParams.get("from") || ""; // YYYY-MM-DD
    const dateTo = searchParams.get("to") || "";     // YYYY-MM-DD

    // Build date filter
    let dateFilter = "";

    if (dateFrom && dateTo) {
      // Custom range
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

    // Build combined filter — specialist filter via linked record ID
    const filters = [dateFilter];
    if (specialistId) {
      filters.push(`SEARCH("${specialistId}", ARRAYJOIN({Майстер}))`);
    }

    const filterFormula = filters.length > 1
      ? `AND(${filters.join(",")})`
      : filters[0];

    // Fetch journal, specialists, and services catalog in parallel
    const [records, specialistRecords, serviceCatalog] = await Promise.all([
      fetchAllRecords(TABLES.services, {
        filterByFormula: filterFormula,
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
        ],
      }),
      fetchAllRecords(TABLES.specialists, { fields: ["Ім'я"] }),
      fetchAllRecords(TABLES.servicesCatalog, { fields: ["Назва"] }),
    ]);

    // Build lookup maps
    const specialistMap = new Map<string, string>();
    specialistRecords.forEach((r) => specialistMap.set(r.id, (r.fields["Ім'я"] as string) || ""));

    const serviceMap = new Map<string, string>();
    serviceCatalog.forEach((r) => serviceMap.set(r.id, (r.fields["Назва"] as string) || ""));

    const entries = records.map((r) => {
      const f = r.fields;

      // Determine type
      let type: "service" | "sale" | "expense" | "rental" | "debt" = "service";
      const expenseAmount = f["Сума витрат"] as number | undefined;
      const debtAmount = f["Cума боргу"] as number | undefined;
      const salesLinks = f["Продажі"] as string[] | undefined;

      if (expenseAmount && expenseAmount !== 0) {
        type = "expense";
      } else if (debtAmount && debtAmount !== 0) {
        type = "debt";
      } else if (salesLinks && salesLinks.length > 0 && !f["Послуга"]) {
        type = "sale";
      }

      // Get specialist name
      const masterLinks = f["Майстер"] as string[] | undefined;
      let specialistName = "";
      let specialistRecId = "";
      if (masterLinks && masterLinks.length > 0) {
        specialistRecId = masterLinks[0];
        specialistName = specialistMap.get(masterLinks[0]) || "";
      }

      // Get service name
      const serviceLinks = f["Послуга"] as string[] | undefined;
      let title = "";
      if (serviceLinks && serviceLinks.length > 0) {
        title = serviceMap.get(serviceLinks[0]) || "";
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
      if (type === "expense") {
        amount = -(Math.abs(expenseAmount || 0));
      } else if (type === "debt") {
        amount = debtAmount || 0;
      } else if (type === "sale" && !f["Послуга"]) {
        amount = (f["Всього ціна продажі"] as number) || 0;
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
        source,
        time,
        paymentType: (f["вид оплати"] as string) || undefined,
      };
    });

    return NextResponse.json(entries);
  } catch (error) {
    console.error("Failed to fetch journal:", error);
    return NextResponse.json({ error: "Failed to fetch journal" }, { status: 500 });
  }
}
