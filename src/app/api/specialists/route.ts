import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { compensationTypeFromLabel, labelFromCompensationType } from "@/lib/compensation";
import { SPECIALIST_FIELDS } from "@/lib/airtable-fields";

function mapSpecialist(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const salonPercent = (f[SPECIALIST_FIELDS.salonPctForService] as number) || 0;
  const salesPercent = (f[SPECIALIST_FIELDS.masterPctForMaterialsSale] as number) || 0;
  const productSalesPercent = (f[SPECIALIST_FIELDS.masterPctForSale] as number) || 0;

  const type = compensationTypeFromLabel(f[SPECIALIST_FIELDS.compensationType] as string | undefined);

  let avatarColor: "brand" | "amber" | "gray" = "brand";
  if (type === "rental") avatarColor = "amber";
  else if (type === "hourly") avatarColor = "brand";
  else if (type === "salary") avatarColor = "gray";

  // Format birthday
  let birthday = "";
  if (f[SPECIALIST_FIELDS.birthday]) {
    const date = new Date(f[SPECIALIST_FIELDS.birthday] as string);
    const months = [
      "січня", "лютого", "березня", "квітня", "травня", "червня",
      "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
    ];
    birthday = `${date.getDate()} ${months[date.getMonth()]}`;
  }

  // Airtable checkbox: true = active, false/undefined = inactive
  // (Airtable stores false as absent, so undefined also means "unchecked")
  const isActive = f[SPECIALIST_FIELDS.isActive] === true;

  // Linked field → array of { id, name } objects. We only need IDs here;
  // the PWA joins against useSpecializations() to resolve categories.
  const rawSpec = f[SPECIALIST_FIELDS.specializations];
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
    name: (f[SPECIALIST_FIELDS.name] as string) || "",
    specializationIds,
    compensationType: type,
    serviceCommission: salonPercent,
    salesCommission: salesPercent,
    productSalesCommission: productSalesPercent,
    rentalRate: type === "rental" ? (f[SPECIALIST_FIELDS.terms] as number) || 0 : undefined,
    hourlyRate: type === "hourly" ? (f[SPECIALIST_FIELDS.terms] as number) || 0 : undefined,
    salaryRate: type === "salary" ? (f[SPECIALIST_FIELDS.terms] as number) || 0 : undefined,
    conditions: (f[SPECIALIST_FIELDS.terms] as number) || 0,
    balance: (f[SPECIALIST_FIELDS.balance] as number) || 0,
    birthday,
    birthdayRaw: (f[SPECIALIST_FIELDS.birthday] as string) || "",
    avatarColor,
    isActive,
  };
}

export async function GET(request: NextRequest) {
  try {
    const showAll = request.nextUrl.searchParams.get("all") === "1";

    const records = await fetchAllRecords(TABLES.specialists, {
      fields: [
        SPECIALIST_FIELDS.name,
        SPECIALIST_FIELDS.salonPctForService,
        SPECIALIST_FIELDS.masterPctForMaterialsSale,
        SPECIALIST_FIELDS.masterPctForSale,
        SPECIALIST_FIELDS.terms,
        SPECIALIST_FIELDS.balance,
        SPECIALIST_FIELDS.birthday,
        SPECIALIST_FIELDS.isActive,
        SPECIALIST_FIELDS.compensationType,
        SPECIALIST_FIELDS.specializations,
      ],
      sort: [{ field: SPECIALIST_FIELDS.name, direction: "asc" }],
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
      [SPECIALIST_FIELDS.name]: name,
      [SPECIALIST_FIELDS.isActive]: true,
    };

    if (birthday) fields[SPECIALIST_FIELDS.birthday] = birthday;
    if (Array.isArray(specializationIds)) {
      fields[SPECIALIST_FIELDS.specializations] = specializationIds;
    }

    fields[SPECIALIST_FIELDS.compensationType] = labelFromCompensationType(compensationType);

    // Percentages
    if (serviceCommission !== undefined) fields[SPECIALIST_FIELDS.salonPctForService] = serviceCommission;
    if (salesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForMaterialsSale] = salesCommission;
    if (productSalesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForSale] = productSalesCommission;
    if (conditions !== undefined) fields[SPECIALIST_FIELDS.terms] = conditions;

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

    if (updates.name !== undefined) fields[SPECIALIST_FIELDS.name] = updates.name;
    if (updates.birthday !== undefined) fields[SPECIALIST_FIELDS.birthday] = updates.birthday || null;
    if (updates.specializationIds !== undefined) {
      fields[SPECIALIST_FIELDS.specializations] = Array.isArray(updates.specializationIds)
        ? updates.specializationIds
        : [];
    }
    if (updates.isActive !== undefined) fields[SPECIALIST_FIELDS.isActive] = updates.isActive;

    if (updates.compensationType !== undefined) {
      fields[SPECIALIST_FIELDS.compensationType] = labelFromCompensationType(updates.compensationType);
    }

    if (updates.serviceCommission !== undefined) fields[SPECIALIST_FIELDS.salonPctForService] = updates.serviceCommission;
    if (updates.salesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForMaterialsSale] = updates.salesCommission;
    if (updates.productSalesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForSale] = updates.productSalesCommission;
    if (updates.conditions !== undefined) fields[SPECIALIST_FIELDS.terms] = updates.conditions;

    await updateRecord(TABLES.specialists, id, fields);
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update specialist:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
