import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.specialists, {
      fields: [
        "Ім'я",
        "Вид діяльності",
        "% cалону за послугу",
        "% майстру за продаж матеріалів",
        "Умови співпраці",
        "Баланс",
        "Дата народження",
        "is_active",
        "Тип оплати",
      ],
      sort: [{ field: "Ім'я", direction: "asc" }],
    });

    const specialists = records.map((r) => {
      const f = r.fields;
      const compensationType = (f["Тип оплати"] as string) || "комісія";
      const salonPercent = (f["% cалону за послугу"] as number) || 0;
      const salesPercent = (f["% майстру за продаж матеріалів"] as number) || 0;

      let type: "commission" | "rental" | "salary" = "commission";
      if (compensationType === "оренда") type = "rental";
      else if (compensationType === "зарплата") type = "salary";

      let avatarColor: "brand" | "amber" | "gray" = "brand";
      if (type === "rental") avatarColor = "amber";
      else if (type === "salary") avatarColor = "gray";

      // Format birthday
      let birthday = "";
      if (f["Дата народження"]) {
        const date = new Date(f["Дата народження"] as string);
        const months = [
          "січня", "лютого", "березня", "квітня", "травня", "червня",
          "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
        ];
        birthday = `${date.getDate()} ${months[date.getMonth()]}`;
      }

      return {
        id: r.id,
        name: (f["Ім'я"] as string) || "",
        role: (f["Вид діяльності"] as string) || "",
        compensationType: type,
        serviceCommission: salonPercent,
        salesCommission: salesPercent,
        rentalRate: type === "rental" ? (f["Умови співпраці"] as number) || 0 : undefined,
        salaryRate: type === "salary" ? (f["Умови співпраці"] as number) || 0 : undefined,
        balance: (f["Баланс"] as number) || 0,
        birthday,
        avatarColor,
        isActive: f["is_active"] === true || f["is_active"] === undefined,
      };
    });

    // Filter active only
    const active = specialists.filter((s) => s.isActive);
    return NextResponse.json(active);
  } catch (error) {
    console.error("Failed to fetch specialists:", error);
    return NextResponse.json({ error: "Failed to fetch specialists" }, { status: 500 });
  }
}
