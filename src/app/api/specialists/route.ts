import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, createRecord, updateRecord, TABLES } from "@/lib/airtable";
import { compensationTypeFromLabel, labelFromCompensationType } from "@/lib/compensation";
import { SPECIALIST_FIELDS, SERVICE_FIELDS, OWNERSHIP_FIELDS } from "@/lib/airtable-fields";

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
 * Віртуальні баланси усіх співробітників + N власників — одним
 * скануванням журналу + завантаженням ревізій розподілу прибутку.
 *
 * Чому віртуально, а не з Airtable-поля `Баланс`:
 *  - Airtable rollup/formula не вміє фільтрувати по {isCanceled}. Soft-delete
 *    журнального запису ховає його в PWA, але в роллапі він лишається.
 *  - Треба ділити netSalon між N власниками за активною на дату запису
 *    ревізією — це не виразити Airtable-формулою. Обчислюємо тут.
 *
 * Формули:
 *   masterBalance[id] = Σ masterPayTotal(записи з master=id, !canceled)
 *                     + Σ debtAmount(записи з master=id, !canceled, і id НЕ є власником)
 *
 *   ownerBalance[id]  = Σ netSalon(r) * share(id, r.date) / 100   — по всіх r
 *                     + Σ debtAmount(записи з master=id, !canceled, і id Є власник)
 *
 *   де share(id, date) = частка власника id, що діяла на дату date.
 *   Якщо ревізій немає — fallback: єдиний isOwner=true отримує 100%.
 *
 * Master-owner трохи незручно: debt, прив'язаний до такої людини, зараз
 * весь зараховується в owner-пул (виплата прибутку). Якщо салон почне
 * платити таким людям ще й зарплату — потрібен буде маркер типу боргу
 * у журналі (checkbox `isOwnerDraw` чи singleSelect). Поки не реалізовано,
 * тільки для чистого кейса (master+owner — 1 людина, зарплату сама собі
 * не виписує) результат коректний.
 *
 * Дорого? O(N) по журналу + O(R log R) по ревізіях. Кілька тисяч записів,
 * прийнятно. Якщо стане дорого — винесемо у cron-пре-агрегацію.
 */

interface OwnershipRevisionRow {
  date: string; // ISO
  specialistId: string;
  sharePct: number;
}

/**
 * Повертає список активних власників з частками на дату `date`.
 * Активна ревізія = група рядків з max(Дата) <= date.
 * Якщо ревізій взагалі немає — повертаємо null (caller робить fallback).
 */
function activeSharesOn(
  revisions: OwnershipRevisionRow[],
  date: string,
): Map<string, number> | null {
  if (revisions.length === 0) return null;
  // revisions відсортовані asc по даті; шукаємо найбільшу, що <= date.
  let effectiveDate: string | null = null;
  for (const r of revisions) {
    if (r.date <= date) effectiveDate = r.date;
    else break;
  }
  if (effectiveDate === null) return null; // запис старший за будь-яку ревізію
  const result = new Map<string, number>();
  for (const r of revisions) {
    if (r.date === effectiveDate) {
      result.set(r.specialistId, (result.get(r.specialistId) || 0) + r.sharePct);
    }
  }
  return result;
}

async function loadOwnershipRevisions(): Promise<OwnershipRevisionRow[]> {
  const records = await fetchAllRecords(TABLES.ownership, {
    fields: [OWNERSHIP_FIELDS.date, OWNERSHIP_FIELDS.specialist, OWNERSHIP_FIELDS.sharePct],
  });
  const rows: OwnershipRevisionRow[] = [];
  for (const r of records) {
    const f = r.fields;
    const rawDate = f[OWNERSHIP_FIELDS.date];
    if (typeof rawDate !== "string") continue;
    const date = rawDate.slice(0, 10);
    const specLinks = f[OWNERSHIP_FIELDS.specialist] as unknown;
    let specialistId: string | null = null;
    if (Array.isArray(specLinks) && specLinks.length > 0) {
      const first = specLinks[0];
      specialistId = typeof first === "string"
        ? first
        : (first && typeof first === "object" && "id" in first
          ? (first as { id: string }).id
          : null);
    }
    if (!specialistId) continue;
    const sharePct = (f[OWNERSHIP_FIELDS.sharePct] as number) || 0;
    if (sharePct <= 0) continue;
    rows.push({ date, specialistId, sharePct });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

async function computeBalances(
  ownerIds: Set<string>,
): Promise<{ byMaster: Map<string, number>; byOwner: Map<string, number> }> {
  const [records, revisions] = await Promise.all([
    fetchAllRecords(TABLES.services, {
      fields: [
        SERVICE_FIELDS.date,
        SERVICE_FIELDS.netSalon,
        SERVICE_FIELDS.masterPayTotal,
        SERVICE_FIELDS.debtAmount,
        SERVICE_FIELDS.master,
        SERVICE_FIELDS.isCanceled,
      ],
    }),
    loadOwnershipRevisions(),
  ]);

  const byMaster = new Map<string, number>();
  const byOwner = new Map<string, number>();

  // Fallback, коли ревізій ще немає: увесь netSalon → єдиному власнику.
  // Якщо власників кілька, а ревізій 0 — ділимо порівну (edge-case; UI
  // змусить створити ревізію, але не хочемо крашитись).
  const fallbackOwners = Array.from(ownerIds);
  const fallbackShare = fallbackOwners.length > 0 ? 100 / fallbackOwners.length : 0;

  for (const r of records) {
    const f = r.fields;
    if (f[SERVICE_FIELDS.isCanceled] === true) continue;

    const date = typeof f[SERVICE_FIELDS.date] === "string"
      ? (f[SERVICE_FIELDS.date] as string).slice(0, 10)
      : "";
    const netSalon = (f[SERVICE_FIELDS.netSalon] as number) || 0;
    const masterPay = (f[SERVICE_FIELDS.masterPayTotal] as number) || 0;
    const debt = (f[SERVICE_FIELDS.debtAmount] as number) || 0;
    const masterLinks = (f[SERVICE_FIELDS.master] as string[] | undefined) || [];

    // Розподіл netSalon по власникам за активною ревізією на дату запису.
    if (netSalon !== 0) {
      const shares = activeSharesOn(revisions, date);
      if (shares && shares.size > 0) {
        for (const [ownerId, pct] of shares) {
          byOwner.set(ownerId, (byOwner.get(ownerId) || 0) + (netSalon * pct) / 100);
        }
      } else if (fallbackOwners.length > 0) {
        for (const oid of fallbackOwners) {
          byOwner.set(oid, (byOwner.get(oid) || 0) + (netSalon * fallbackShare) / 100);
        }
      }
    }

    // Master pay → майстру (завжди, навіть якщо він і власник).
    if (masterPay !== 0) {
      for (const mid of masterLinks) {
        byMaster.set(mid, (byMaster.get(mid) || 0) + masterPay);
      }
    }

    // Debt: для власника йде в owner-пул, для майстра — у master-баланс.
    if (debt !== 0) {
      for (const mid of masterLinks) {
        if (ownerIds.has(mid)) {
          byOwner.set(mid, (byOwner.get(mid) || 0) + debt);
        } else {
          byMaster.set(mid, (byMaster.get(mid) || 0) + debt);
        }
      }
    }
  }

  return { byMaster, byOwner };
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

    let specialists: (ReturnType<typeof mapSpecialist> & { ownerBalance?: number })[] =
      records.map(mapSpecialist);

    if (!showAll) {
      specialists = specialists.filter((s) => s.isActive);
    }

    // Віртуальні баланси (N власників + ревізії) — перезаписують значення з
    // Airtable. Master-owner отримає і balance (master-частина), і
    // ownerBalance (owner-частина) — UI показує окремо.
    const ownerIds = new Set(specialists.filter((s) => s.isOwner).map((s) => s.id));
    try {
      const { byMaster, byOwner } = await computeBalances(ownerIds);
      specialists = specialists.map((s) => {
        const next = { ...s };
        // Майстер-частина (кожен хто має masterPayTotal — навіть власник,
        // якщо сам собі виписує послуги).
        const masterPart = byMaster.get(s.id);
        if (masterPart !== undefined) next.balance = masterPart;
        else if (!s.isOwner) next.balance = 0;

        // Owner-частина — тільки для isOwner=true.
        if (s.isOwner) {
          const ownerPart = byOwner.get(s.id) || 0;
          next.ownerBalance = ownerPart;
          // Для owner-only (без нарахувань як майстра) — balance = ownerBalance
          // щоб існуючий UI (owner-картка в StaffScreen) продовжував працювати
          // без змін. Master-owner UI пізніше читатиме ownerBalance окремо.
          if (masterPart === undefined) next.balance = ownerPart;
        }
        return next;
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

    // N власників на базу — розподіл налаштовується в Налаштування → Власники
    // та частки. Стара 1-to-1 валідація знята після переходу на Розподіл
    // прибутку (таблиця Ownership, див. /api/ownership).

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

    // N власників на базу — див. коментар у POST.

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
