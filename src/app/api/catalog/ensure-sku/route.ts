import { NextResponse } from "next/server";
import { fetchAllRecords, updateRecord, TABLES } from "@/lib/airtable";

/**
 * POST /api/catalog/ensure-sku
 * One-shot: scans both tables, assigns SKU to records that don't have one.
 */
export async function POST() {
  try {
    let productsFixed = 0;
    let materialsFixed = 0;

    // Products (Прайс)
    const products = await fetchAllRecords(TABLES.priceList, { fields: ["sku"] });
    let maxP = 0;
    for (const r of products) {
      const m = ((r.fields["sku"] as string) || "").match(/^P-(\d+)$/);
      if (m) maxP = Math.max(maxP, parseInt(m[1], 10));
    }
    for (const r of products) {
      if (!r.fields["sku"]) {
        maxP++;
        await updateRecord(TABLES.priceList, r.id, { sku: `P-${String(maxP).padStart(6, "0")}` });
        productsFixed++;
      }
    }

    // Materials (Калькуляція)
    const materials = await fetchAllRecords(TABLES.calculation, { fields: ["sku"] });
    let maxM = 0;
    for (const r of materials) {
      const m = ((r.fields["sku"] as string) || "").match(/^M-(\d+)$/);
      if (m) maxM = Math.max(maxM, parseInt(m[1], 10));
    }
    for (const r of materials) {
      if (!r.fields["sku"]) {
        maxM++;
        await updateRecord(TABLES.calculation, r.id, { sku: `M-${String(maxM).padStart(6, "0")}` });
        materialsFixed++;
      }
    }

    return NextResponse.json({
      success: true,
      products: productsFixed,
      materials: materialsFixed,
      message: `Присвоєно SKU: ${productsFixed} товарам, ${materialsFixed} матеріалам`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("ensure-sku failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
