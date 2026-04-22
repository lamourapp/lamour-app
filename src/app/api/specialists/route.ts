import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { compensationTypeFromLabel, labelFromCompensationType } from "@/lib/compensation";
import { SPECIALIST_FIELDS, SERVICE_FIELDS } from "@/lib/airtable-fields";

function mapSpecialist(r: { id: string; fields: Record<string, unknown> }) {
  const f = r.fields;
  const salonPercent = (f[SPECIALIST_FIELDS.salonPctForService] as number) || 0;
  const salesPercent = (f[SPECIALIST_FIELDS.masterPctForMaterialsSale] as number) || 0;
  const productSalesPercent = (f[SPECIALIST_FIELDS.masterPctForSale] as number) || 0;

  const isOwner = f[SPECIALIST_FIELDS.isOwner] === true;

  // Owner має фіксований «тип оплати» навіть якщо в Airtable зберігається
  // інше значення — картка не показує ставок, виплат немає.
  const type = isOwner
    ? "owner"
    : compensationTypeFromLabel(f[SPECIALIST_FIELDS.compensationType] as string | undefined);

  let avatarColor: "brand" | "amber" | "gray" = "brand";
  if (isOwner) avatarColor = "brand"; // окремий рендер у StaffScreen — колір не критичний
  else if (type === "rental") avatarColor = "amber";
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
    isOwner,
  };
}

/**
 * Віртуальні баланси усіх співробітників + власника — одним скануванням журналу.
 *
 * Чому віртуально, а не з Airtable-поля `Баланс`:
 *  - Airtable rollup/formula не вміє фільтрувати по {isCanceled}. Soft-delete
 *    журнального запису ховає його в PWA, але в роллапі він лишається —
 *    баланс майстра не зменшується після скасування. Баг: можна видалити
 *    послугу, але зарплата далі «нарахована».
 *  - Обчислюючи тут, ми автоматично консистентні з журналом/дашбордом.
 *
 * Формули:
 *   masterBalance[id] = Σ masterPayTotal(записи з master=id, не canceled)
 *                     + Σ debtAmount(записи з master=id, не canceled)
 *   ownerBalance      = Σ netSalon(усі записи, не canceled)
 *                     + Σ debtAmount(записи з master=ownerId, не canceled)
 *
 * Для майстра: нарахування за послуги + підписаний рух по боргах
 * (− = виплата зарплати, + = довнесення в касу майстром).
 * Для власника: накопичений чистий дохід салону + рух по ownerId.
 *
 * Дорого? O(N) по журналу — кілька тисяч записів, прийнятно. Якщо стане
 * дорого — винесемо у cron-пре-агрегацію.
 */
async function computeBalances(
  ownerId: string | null,
): Promise<{ byMaster: Map<string, number>; owner: number | null }> {
  const records = await fetchAllRecords(TABLES.services, {
    fields: [
      SERVICE_FIELDS.netSalon,
      SERVICE_FIELDS.masterPayTotal,
      SERVICE_FIELDS.debtAmount,
      SERVICE_FIELDS.master,
      SERVICE_FIELDS.isCanceled,
    ],
  });

  const byMaster = new Map<string, number>();
  let owner = 0;

  for (const r of records) {
    const f = r.fields;
    if (f[SERVICE_FIELDS.isCanceled] === true) continue;

    const netSalon = (f[SERVICE_FIELDS.netSalon] as number) || 0;
    const masterPay = (f[SERVICE_FIELDS.masterPayTotal] as number) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number) || 0;
    const masterLinks = (f[SERVICE_FIELDS.master] as string[] | undefined) || [];

    owner += netSalon;

    // Нарахування майстру за його послуги.
    if (masterPay !== 0) {
      for (const mid of masterLinks) {
        byMaster.set(mid, (byMaster.get(mid) || 0) + masterPay);
      }
    }

    // Підписаний рух по боргах — і для власника, і для майстра.
    if (debt !== 0) {
      for (const mid of masterLinks) {
        if (mid === ownerId) {
          owner += debt;
        } else {
          byMaster.set(mid, (byMaster.get(mid) || 0) + debt);
        }
      }
    }
  }

  return { byMaster, owner: ownerId ? owner : null };
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
        SPECIALIST_FIELDS.isOwner,
      ],
      sort: [{ field: SPECIALIST_FIELDS.name, direction: "asc" }],
    });

    let specialists = records.map(mapSpecialist);

    if (!showAll) {
      specialists = specialists.filter((s) => s.isActive);
    }

    // Віртуальні баланси — перезаписують значення з Airtable, бо тамтешній
    // роллап не знає про soft-delete (isCanceled).
    const ownerId = specialists.find((s) => s.isOwner)?.id || null;
    try {
      const { byMaster, owner } = await computeBalances(ownerId);
      specialists = specialists.map((s) => {
        if (s.isOwner && owner !== null) return { ...s, balance: owner };
        if (!s.isOwner) return { ...s, balance: byMaster.get(s.id) || 0 };
        return s;
      });
    } catch (e) {
      // Якщо агрегація впала — лишаємо Airtable-значення, не валимо весь список.
      console.error("computeBalances failed:", e);
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
    const { name, compensationType, serviceCommission, salesCommission, productSalesCommission, conditions, birthday, specializationIds, isOwner } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Валідація: лише один власник на базу.
    if (isOwner === true) {
      const existing = await fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.isOwner],
      });
      const alreadyHasOwner = existing.some((r) => r.fields[SPECIALIST_FIELDS.isOwner] === true);
      if (alreadyHasOwner) {
        return NextResponse.json(
          { error: "Власник вже є. Зніміть прапорець у існуючого або деактивуйте його." },
          { status: 400 },
        );
      }
    }

    const fields: Record<string, unknown> = {
      [SPECIALIST_FIELDS.name]: name,
      [SPECIALIST_FIELDS.isActive]: true,
    };

    if (birthday) fields[SPECIALIST_FIELDS.birthday] = birthday;
    if (Array.isArray(specializationIds)) {
      fields[SPECIALIST_FIELDS.specializations] = specializationIds;
    }

    if (isOwner === true) {
      fields[SPECIALIST_FIELDS.isOwner] = true;
      // Власник: ніяких ставок і типу оплати.
    } else {
      fields[SPECIALIST_FIELDS.compensationType] = labelFromCompensationType(compensationType);
      // Percentages
      if (serviceCommission !== undefined) fields[SPECIALIST_FIELDS.salonPctForService] = serviceCommission;
      if (salesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForMaterialsSale] = salesCommission;
      if (productSalesCommission !== undefined) fields[SPECIALIST_FIELDS.masterPctForSale] = productSalesCommission;
      if (conditions !== undefined) fields[SPECIALIST_FIELDS.terms] = conditions;
    }

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

    // Валідація: лише один власник на базу.
    if (updates.isOwner === true) {
      const existing = await fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.isOwner],
      });
      const conflict = existing.find(
        (r) => r.id !== id && r.fields[SPECIALIST_FIELDS.isOwner] === true,
      );
      if (conflict) {
        return NextResponse.json(
          { error: "Власник вже є. Зніміть прапорець у існуючого." },
          { status: 400 },
        );
      }
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
    if (updates.isOwner !== undefined) fields[SPECIALIST_FIELDS.isOwner] = updates.isOwner;

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
