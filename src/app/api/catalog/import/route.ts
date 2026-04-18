import { NextRequest, NextResponse } from "next/server";
import { fetchAllRecords, batchUpdateRecords, createRecord, TABLES } from "@/lib/airtable";

/**
 * POST /api/catalog/import?type=products|materials
 * Body: CSV text (same format as export)
 *
 * Matching by SKU:
 * - If SKU exists → update fields
 * - If SKU empty / not found → create new record (auto-generate SKU)
 *
 * Returns { updated, created, errors[] }
 */

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  // Remove BOM if present
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }

  return rows;
}

/** Generate next SKU */
function nextSku(prefix: string, existing: string[]): string {
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  for (const s of existing) {
    const m = s.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

export async function POST(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type");
  if (type !== "products" && type !== "materials") {
    return NextResponse.json({ error: "type must be products or materials" }, { status: 400 });
  }

  try {
    const csvText = await request.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      return NextResponse.json({ error: "CSV must have header + at least 1 row" }, { status: 400 });
    }

    const header = rows[0].map((h) => h.toLowerCase());
    const dataRows = rows.slice(1);

    // Column index lookup
    const col = (name: string) => header.indexOf(name.toLowerCase());

    const skuIdx = col("sku");
    const nameIdx = col("назва");
    const articleIdx = col("артикул");
    const barcodeIdx = col("штрих-код");
    const costIdx = col("ціна закупки");
    const saleIdx = col("ціна продажу");
    const activeIdx = col("активний");

    if (nameIdx === -1) {
      return NextResponse.json({ error: 'CSV must have "Назва" column' }, { status: 400 });
    }

    const tableId = type === "products" ? TABLES.priceList : TABLES.calculation;
    const skuPrefix = type === "products" ? "P" : "M";
    const nameField = type === "products" ? "Назва" : "Name";
    const costField = type === "products" ? "ціна закупки" : "закупка";
    const saleField = type === "products" ? "ціна продажу" : "Вартість";

    // Product-specific columns
    const specPctIdx = type === "products" ? col("% спеціалісту") : -1;

    // Material-specific columns
    const volumeIdx = type === "materials" ? col("фасування") : -1;
    const unitIdx = type === "materials" ? col("одиниця") : -1;

    // Fetch existing records to match by SKU
    const existing = await fetchAllRecords(tableId, { fields: ["sku"] });
    const skuToId = new Map<string, string>();
    const allSkus: string[] = [];
    for (const r of existing) {
      const sku = (r.fields["sku"] as string) || "";
      if (sku) {
        skuToId.set(sku, r.id);
        allSkus.push(sku);
      }
    }

    const updates: { id: string; fields: Record<string, unknown> }[] = [];
    const creates: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNum = i + 2; // 1-based, +1 for header
      const name = nameIdx >= 0 ? row[nameIdx] : "";
      if (!name) {
        errors.push(`Рядок ${rowNum}: порожня назва, пропущено`);
        continue;
      }

      const sku = skuIdx >= 0 ? row[skuIdx] : "";
      const fields: Record<string, unknown> = {};
      fields[nameField] = name;

      if (articleIdx >= 0 && row[articleIdx]) fields["артикул"] = row[articleIdx];
      if (barcodeIdx >= 0 && row[barcodeIdx]) fields["штрих-код"] = row[barcodeIdx];
      if (costIdx >= 0 && row[costIdx]) fields[costField] = parseFloat(row[costIdx]);
      if (saleIdx >= 0 && row[saleIdx]) fields[saleField] = parseFloat(row[saleIdx]);

      if (activeIdx >= 0 && row[activeIdx]) {
        const val = row[activeIdx].toLowerCase();
        fields["неактивний"] = val === "ні" || val === "no" || val === "false" || val === "0";
      }

      // Product-specific
      if (type === "products") {
        if (specPctIdx >= 0 && row[specPctIdx]) {
          // Convert specialist % → salon %
          fields["% cалону"] = 100 - parseFloat(row[specPctIdx]);
        }
      }

      // Material-specific
      if (type === "materials") {
        if (volumeIdx >= 0 && row[volumeIdx]) fields["Всього мл/шт"] = parseFloat(row[volumeIdx]);
        if (unitIdx >= 0 && row[unitIdx]) fields["одиниця"] = row[unitIdx];
      }

      const recordId = sku ? skuToId.get(sku) : undefined;
      if (recordId) {
        updates.push({ id: recordId, fields });
      } else {
        creates.push(fields);
      }
    }

    // Execute batch updates
    if (updates.length > 0) {
      await batchUpdateRecords(tableId, updates);
    }

    // Create new records one by one (need sequential SKU generation)
    let created = 0;
    for (const fields of creates) {
      const sku = nextSku(skuPrefix, allSkus);
      allSkus.push(sku);
      fields["sku"] = sku;
      await createRecord(tableId, fields);
      created++;
    }

    return NextResponse.json({
      success: true,
      updated: updates.length,
      created,
      errors,
      message: `Оновлено: ${updates.length}, створено: ${created}${errors.length ? `, помилок: ${errors.length}` : ""}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("import failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
