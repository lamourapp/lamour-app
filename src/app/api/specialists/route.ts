import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { compensationTypeFromLabel, labelFromCompensationType } from "@/lib/compensation";

function mapSpecialist(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const salonPercent = (f["% cалону за послугу"] as number) || 0;
  const salesPercent = (f["% майстру за продаж матеріалів"] as number) || 0;
  const productSalesPercent = (f["% за продаж"] as number) || 0;

  const type = compensationTypeFromLabel(f["Тип оплати"] as string | undefined);

  let avatarColor: "brand" | "amber" | "gray" = "brand";
  if (type === "rental") avatarColor = "amber";
  else if (type === "hourly") avatarColor = "brand";
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

  // Airtable checkbox: true = active, false/undefined = inactive
  // (Airtable stores false as absent, so undefined also means "unchecked")
  const isActive = f["is_active"] === true;

  // Linked field → array of { id, name } objects. We only need IDs here;
  // the PWA joins against useSpecializations() to resolve categories.
  const rawSpec = f["Спеціалізації"];
  const specializationIds: string[] = Array.isArray(rawSpec)
    ? rawSpec
        .map((s) =>
          typeof s === "string"
            ? s
            : s && typeof s === "object" && "id" in (s as Record<string, unknown>)
              ? (s as { id: string }).id
              : "",
        )
        .filter(Boolean)
    : [];

  return {
    id: r.id,
    name: (f["Ім'я"] as string) || "",
    specializationIds,
    compensationType: type,
    serviceCommission: salonPercent,
    salesCommission: salesPercent,
    productSalesCommission: productSalesPercent,
    rentalRate: type === "rental" ? (f["Умови співпраці"] as number) || 0 : undefined,
    hourlyRate: type === "hourly" ? (f["Умови співпраці"] as number) || 0 : undefined,
    salaryRate: type === "salary" ? (f["Умови співпраці"] as number) || 0 : undefined,
    conditions: (f["Умови співпраці"] as number) || 0,
    balance: (f["Баланс"] as number) || 0,
    birthday,
    birthdayRaw: (f["Дата народження"] as string) || "",
    avatarColor,
    isActive,
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";

    const records = await fetchAllRecords(TABLES.specialists, {
      fields: [
        "Ім'я",
        "% cалону за послугу",
        "% майстру за продаж матеріалів",
        "% за продаж",
        "Умови співпраці",
        "Баланс",
        "Дата народження",
        "is_active",
        "Тип оплати",
        "Спеціалізації",
      ],
      sort: [{ field: "Ім'я", direction: "asc" }],
    });

    let specialists = records.map(mapSpecialist);

    if (!showAll) {
      specialists = specialists.filter((s) => s.isActive);
    }

    return NextResponse.json(specialists);
  } catch (error) {
    console.error("Failed to fetch specialists:", error);
    return NextResponse.json({ error: "Failed to fetch specialists" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, compensationType, serviceCommission, salesCommission, productSalesCommission, conditions, birthday, specializationIds } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {
      "Ім'я": name,
      "is_active": true,
    };

    if (birthday) fields["Дата народження"] = birthday;
    if (Array.isArray(specializationIds)) {
      fields["Спеціалізації"] = specializationIds;
    }

    fields["Тип оплати"] = labelFromCompensationType(compensationType);

    // Percentages
    if (serviceCommission !== undefined) fields["% cалону за послугу"] = serviceCommission;
    if (salesCommission !== undefined) fields["% майстру за продаж матеріалів"] = salesCommission;
    if (productSalesCommission !== undefined) fields["% за продаж"] = productSalesCommission;
    if (conditions !== undefined) fields["Умови співпраці"] = conditions;

    const result = await createRecord(TABLES.specialists, fields);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create specialist:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id || typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "Invalid record ID" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {};

    if (updates.name !== undefined) fields["Ім'я"] = updates.name;
    if (updates.birthday !== undefined) fields["Дата народження"] = updates.birthday || null;
    if (updates.specializationIds !== undefined) {
      fields["Спеціалізації"] = Array.isArray(updates.specializationIds)
        ? updates.specializationIds
        : [];
    }
    if (updates.isActive !== undefined) fields["is_active"] = updates.isActive;

    if (updates.compensationType !== undefined) {
      fields["Тип оплати"] = labelFromCompensationType(updates.compensationType);
    }

    if (updates.serviceCommission !== undefined) fields["% cалону за послугу"] = updates.serviceCommission;
    if (updates.salesCommission !== undefined) fields["% майстру за продаж матеріалів"] = updates.salesCommission;
    if (updates.productSalesCommission !== undefined) fields["% за продаж"] = updates.productSalesCommission;
    if (updates.conditions !== undefined) fields["Умови співпраці"] = updates.conditions;

    await updateRecord(TABLES.specialists, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update specialist:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
