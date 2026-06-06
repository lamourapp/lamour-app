import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  TABLES,
} from "@/lib/airtable";
import { PURCHASE_FIELDS } from "@/lib/airtable-fields";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/**
 * Закупки матеріалів / виплати постачальникам.
 *
 * Окремий грошовий потік від звичайних "Витрат": matCost від послуг і
 * costPrice від продажів накопичуються віртуально як "Фонд матеріалів",
 * а ця таблиця фіксує реальні виплати з фонду. Не зараховується у
 * Чистий прибуток — він уже врахував собівартість через pricing.ts.
 *
 * Постачальники як окрема сутність свідомо не вводимо — для MVP вистачає
 * вільного тексту. Прив'язку до конкретного матеріалу теж не робимо
 * (виплати в реальності часто одною сумою за змішаний кошик).
 */

export interface Purchase {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  supplier: string;
  comment: string;
  paymentType: string; // "готівка" | "карта" | ""
}

function parseDate(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, 10);
}

function toPurchase(r: { id: string; fields: Record<string, unknown> }): Purchase {
  return {
    id: r.id,
    date: parseDate(r.fields[PURCHASE_FIELDS.date]),
    amount: (r.fields[PURCHASE_FIELDS.amount] as number) || 0,
    supplier: (r.fields[PURCHASE_FIELDS.supplier] as string) || "",
    comment: (r.fields[PURCHASE_FIELDS.comment] as string) || "",
    paymentType: (r.fields[PURCHASE_FIELDS.paymentType] as string) || "",
  };
}

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.purchases, {
      fields: [
        PURCHASE_FIELDS.date,
        PURCHASE_FIELDS.amount,
        PURCHASE_FIELDS.supplier,
        PURCHASE_FIELDS.comment,
        PURCHASE_FIELDS.paymentType,
      ],
      sort: [{ field: PURCHASE_FIELDS.date, direction: "desc" }],
    });
    return NextResponse.json(records.map(toPurchase));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("GET /api/purchases failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, amount, supplier = "", comment = "", paymentType = "" } = body || {};

    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "date має бути у форматі YYYY-MM-DD" },
        { status: 400 },
      );
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount має бути > 0" },
        { status: 400 },
      );
    }

    const fields: Record<string, unknown> = {
      [PURCHASE_FIELDS.date]: date,
      [PURCHASE_FIELDS.amount]: amount,
    };
    if (typeof supplier === "string" && supplier.trim()) {
      fields[PURCHASE_FIELDS.supplier] = supplier.trim();
    }
    if (typeof comment === "string" && comment.trim()) {
      fields[PURCHASE_FIELDS.comment] = comment.trim();
    }
    if (paymentType === "готівка" || paymentType === "карта") {
      fields[PURCHASE_FIELDS.paymentType] = paymentType;
    }

    const created = await createRecord(TABLES.purchases, fields);
    return NextResponse.json(toPurchase(created));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("POST /api/purchases failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, date, amount, supplier, comment, paymentType } = body || {};

    if (typeof id !== "string" || !id.startsWith("rec")) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {};
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      fields[PURCHASE_FIELDS.date] = date;
    }
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      fields[PURCHASE_FIELDS.amount] = amount;
    }
    // Текстові поля: дозволяємо очистку (порожній рядок → null), щоб
    // користувач міг прибрати помилкового постачальника/коментар.
    if (typeof supplier === "string") {
      fields[PURCHASE_FIELDS.supplier] = supplier.trim() || null;
    }
    if (typeof comment === "string") {
      fields[PURCHASE_FIELDS.comment] = comment.trim() || null;
    }
    if (paymentType === "готівка" || paymentType === "карта") {
      fields[PURCHASE_FIELDS.paymentType] = paymentType;
    }

    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: "Нічого оновлювати" }, { status: 400 });
    }

    const updated = await updateRecord(TABLES.purchases, id, fields);
    return NextResponse.json(toPurchase(updated));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("PATCH /api/purchases failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id || !id.startsWith("rec")) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await deleteRecord(TABLES.purchases, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("DELETE /api/purchases failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
