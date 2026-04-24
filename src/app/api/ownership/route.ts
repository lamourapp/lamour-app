import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllRecords,
  batchCreateRecords,
  batchUpdateRecords,
  TABLES,
} from "@/lib/airtable";
import { OWNERSHIP_FIELDS, SPECIALIST_FIELDS } from "@/lib/airtable-fields";

// Next 16: Route Handlers кешуються за замовчуванням. Без цього нові ревізії
// часток власників не видно в UI до хард-релоаду.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const runtime = "nodejs";

/**
 * Розподіл прибутку між N власниками — append-only ревізії.
 *
 * Модель даних:
 *   кожен запис = (Дата, Співробітник, Частка %). Одна ревізія — група
 *   записів з однаковою датою, сума часток = 100%. Активна ревізія на
 *   будь-яку дату журналу = та, що має max(Дата) <= журналДата.
 *
 * Чому append-only:
 *  - історичні баланси мають бути відтворюваними (якщо 01.01 власник
 *    змінив частку — грудневі записи повинні ділитись СТАРОЮ часткою).
 *  - простий аудит — хто коли як змінювався видно напряму в таблиці.
 *  - міграція на Postgres тривіальна (таблиця як є, без мутацій).
 *
 * Зв'язок з `Співробітники.Власник`:
 *  - інваріанта: isOwner=true ⟺ існує активна ревізія, де в цій ревізії
 *    цього співробітника частка > 0. Перевіряється на POST (нижче).
 *  - при знятті isOwner треба створити нову ревізію БЕЗ нього, і
 *    решту часток довести до 100%. UI робить це в одному POST тут.
 */

export interface OwnershipShare {
  specialistId: string;
  specialistName?: string;
  sharePct: number;
}

export interface OwnershipRevision {
  date: string; // ISO YYYY-MM-DD
  /** Airtable createdTime найстаршого рядка групи — tie-breaker на одну дату. */
  createdTime: string;
  comment: string;
  shares: OwnershipShare[];
  /** Id-и окремих рядків Airtable — можуть знадобитись для «скасувати помилкову ревізію». */
  recordIds: string[];
}

/** Вікно групування batch-креата ревізії (рядки 1-ї ревізії створюються в межах секунд). */
const REVISION_GROUP_WINDOW_MS = 60_000;

function parseDate(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Airtable повертає "YYYY-MM-DD" для date-полів. Беремо перші 10 символів на випадок суфіксів.
  return raw.slice(0, 10);
}

function parseLink(raw: unknown): string | null {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "id" in first) {
      return (first as { id: string }).id;
    }
  }
  return null;
}

/**
 * Групування пласких рядків Airtable у ревізії.
 *
 * Ключ групи = (date, createdTime-бакет). Рядки однієї ревізії створюються
 * batch-кретом у межах секунд, тому floor до 60с об'єднує їх; а ревізія,
 * створена пізніше на ту ж дату (навіть через годину), опиняється в
 * окремій групі — це tie-breaker на колізію однакових дат.
 *
 * Порядок списку: від найсвіжішої до найстаршої ((date, createdTime) desc).
 * UI очікує, що [0] = «поточний активний розподіл», решта — історія.
 */
function groupIntoRevisions(
  records: { id: string; fields: Record<string, unknown>; createdTime?: string }[],
  specialistNameById: Map<string, string>,
): OwnershipRevision[] {
  // Сортуємо asc по (date, createdTime) — так ми можемо послідовно «приростити»
  // відкриту групу, а нове входження з розривом >WINDOW відкриває нову.
  const sorted = [...records].sort((a, b) => {
    const ad = parseDate(a.fields[OWNERSHIP_FIELDS.date]);
    const bd = parseDate(b.fields[OWNERSHIP_FIELDS.date]);
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.createdTime || "";
    const bt = b.createdTime || "";
    return at.localeCompare(bt);
  });

  const revs: OwnershipRevision[] = [];
  let current: OwnershipRevision | null = null;
  let currentAnchorMs = 0;

  for (const r of sorted) {
    const f = r.fields;
    const date = parseDate(f[OWNERSHIP_FIELDS.date]);
    const specialistId = parseLink(f[OWNERSHIP_FIELDS.specialist]);
    const sharePct = (f[OWNERSHIP_FIELDS.sharePct] as number) || 0;
    const comment = (f[OWNERSHIP_FIELDS.comment] as string) || "";
    const createdTime = r.createdTime || "1970-01-01T00:00:00.000Z";

    if (!date || !specialistId) continue;

    const ms = Date.parse(createdTime);
    const sameGroup =
      current !== null &&
      current.date === date &&
      ms - currentAnchorMs <= REVISION_GROUP_WINDOW_MS;

    if (!sameGroup) {
      current = { date, createdTime, comment: "", shares: [], recordIds: [] };
      revs.push(current);
      currentAnchorMs = ms;
    }
    if (!current!.comment && comment) current!.comment = comment;
    current!.shares.push({
      specialistId,
      specialistName: specialistNameById.get(specialistId),
      sharePct,
    });
    current!.recordIds.push(r.id);
  }

  // desc — найсвіжіша ревізія зверху.
  revs.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdTime.localeCompare(a.createdTime);
  });
  return revs;
}

export async function GET() {
  try {
    const [ownershipRecords, specialistRecords] = await Promise.all([
      fetchAllRecords(TABLES.ownership, {
        fields: [
          OWNERSHIP_FIELDS.date,
          OWNERSHIP_FIELDS.specialist,
          OWNERSHIP_FIELDS.sharePct,
          OWNERSHIP_FIELDS.comment,
        ],
      }),
      fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.name],
      }),
    ]);

    const nameById = new Map<string, string>();
    for (const r of specialistRecords) {
      nameById.set(r.id, (r.fields[SPECIALIST_FIELDS.name] as string) || "");
    }

    return NextResponse.json(groupIntoRevisions(ownershipRecords, nameById));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /api/ownership failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/ownership — створює нову ревізію.
 *
 * Body:
 *   {
 *     date: "YYYY-MM-DD",
 *     shares: [{specialistId, sharePct}],   // сума = 100, всі > 0
 *     comment?: string,
 *     syncIsOwner?: boolean                 // true → оновити Власник-прапорці
 *                                           //   у Співробітники до списку
 *                                           //   цих shares (решту зняти).
 *   }
 *
 * Повертає створену ревізію. Якщо syncIsOwner — додатково робить PATCH
 * по співробітниках, щоб isOwner відповідав новому розподілу.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      date,
      shares,
      comment = "",
      syncIsOwner = false,
    }: {
      date?: unknown;
      shares?: unknown;
      comment?: unknown;
      syncIsOwner?: unknown;
    } = body || {};

    // Валідація date
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "date має бути у форматі YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Валідація shares
    if (!Array.isArray(shares) || shares.length === 0) {
      return NextResponse.json(
        { error: "shares: мінімум один власник" },
        { status: 400 },
      );
    }

    const cleaned: { specialistId: string; sharePct: number }[] = [];
    const seen = new Set<string>();
    for (const s of shares) {
      if (!s || typeof s !== "object") {
        return NextResponse.json({ error: "Невалідний елемент shares" }, { status: 400 });
      }
      const sid = (s as Record<string, unknown>).specialistId;
      const pct = (s as Record<string, unknown>).sharePct;
      if (typeof sid !== "string" || !sid.startsWith("rec")) {
        return NextResponse.json({ error: "specialistId invalid" }, { status: 400 });
      }
      if (typeof pct !== "number" || !Number.isFinite(pct) || pct <= 0) {
        return NextResponse.json(
          { error: `sharePct має бути > 0 (для ${sid})` },
          { status: 400 },
        );
      }
      if (seen.has(sid)) {
        return NextResponse.json(
          { error: `Дублікат співробітника ${sid} у shares` },
          { status: 400 },
        );
      }
      seen.add(sid);
      cleaned.push({ specialistId: sid, sharePct: pct });
    }

    // Сума часток = 100 (з толерантністю до плаваючої крапки).
    const total = cleaned.reduce((s, x) => s + x.sharePct, 0);
    if (Math.abs(total - 100) > 0.01) {
      return NextResponse.json(
        { error: `Сума часток має бути 100%, зараз ${total.toFixed(2)}` },
        { status: 400 },
      );
    }

    // Створюємо N рядків одним батчем (до 10 — атомарно).
    const commentStr = typeof comment === "string" ? comment : "";
    const records = cleaned.map((s) => ({
      fields: {
        [OWNERSHIP_FIELDS.date]: date,
        [OWNERSHIP_FIELDS.specialist]: [s.specialistId],
        [OWNERSHIP_FIELDS.sharePct]: s.sharePct,
        ...(commentStr ? { [OWNERSHIP_FIELDS.comment]: commentStr } : {}),
      },
    }));
    const created = await batchCreateRecords(TABLES.ownership, records);

    // Синхронізація isOwner: робимо активним прапорець для присутніх у
    // новій ревізії і знімаємо для тих, у кого був але тепер немає.
    if (syncIsOwner === true) {
      const allSpecialists = await fetchAllRecords(TABLES.specialists, {
        fields: [SPECIALIST_FIELDS.isOwner],
      });
      const ownerIds = new Set(cleaned.map((s) => s.specialistId));
      const updates: { id: string; fields: Record<string, unknown> }[] = [];
      for (const r of allSpecialists) {
        const wasOwner = r.fields[SPECIALIST_FIELDS.isOwner] === true;
        const shouldBeOwner = ownerIds.has(r.id);
        if (wasOwner !== shouldBeOwner) {
          updates.push({
            id: r.id,
            fields: { [SPECIALIST_FIELDS.isOwner]: shouldBeOwner },
          });
        }
      }
      if (updates.length > 0) {
        await batchUpdateRecords(TABLES.specialists, updates);
      }
    }

    return NextResponse.json({
      success: true,
      revision: {
        date,
        comment: commentStr,
        shares: cleaned,
        recordIds: created.map((r) => r.id),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("POST /api/ownership failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
