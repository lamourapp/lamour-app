import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.calculation, {
      fields: ["Name", "Всього мл/шт", "Вартість"],
      sort: [{ field: "Name", direction: "asc" }],
    });

    const materials = records.map((r) => ({
      id: r.id,
      name: (r.fields["Name"] as string) || "",
      totalVolume: (r.fields["Всього мл/шт"] as number) || 0,
      totalCost: (r.fields["Вартість"] as number) || 0,
      // Price per unit = totalCost / totalVolume
      pricePerUnit:
        (r.fields["Всього мл/шт"] as number) > 0
          ? (r.fields["Вартість"] as number) / (r.fields["Всього мл/шт"] as number)
          : 0,
    }));

    return NextResponse.json(materials);
  } catch (error) {
    console.error("Failed to fetch materials:", error);
    return NextResponse.json({ error: "Failed to fetch materials" }, { status: 500 });
  }
}
