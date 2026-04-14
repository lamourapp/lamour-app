import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.servicesCatalog, {
      fields: [
        "Назва",
        "ціна роботи",
        "вартість матеріалів продажа",
        "ціна за годину",
        "К-сть годин",
        "Вид послуги",
        "вартість послуги",
      ],
      sort: [{ field: "Назва", direction: "asc" }],
    });

    const services = records.map((r) => {
      const f = r.fields;
      const types = f["Вид послуги"] as { name: string }[] | undefined;
      const workPrice = (f["ціна роботи"] as number) || 0;
      const catalogHourlyRate = (f["ціна за годину"] as number) || 0;
      // Use catalog hourly rate if set, otherwise workPrice IS the hourly rate
      const effectiveHourlyRate = catalogHourlyRate || workPrice;
      return {
        id: r.id,
        name: (f["Назва"] as string) || "",
        workPrice,
        materialsCost: (f["вартість матеріалів продажа"] as number) || 0,
        hourlyRate: effectiveHourlyRate,
        hours: (f["К-сть годин"] as number) || 0,
        totalPrice: (f["вартість послуги"] as number) || 0,
        category: types?.[0]?.name || "",
      };
    });

    return NextResponse.json(services);
  } catch (error) {
    console.error("Failed to fetch services catalog:", error);
    return NextResponse.json({ error: "Failed to fetch services catalog" }, { status: 500 });
  }
}
