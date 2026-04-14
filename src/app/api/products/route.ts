import { NextResponse } from "next/server";
import { fetchAllRecords, TABLES } from "@/lib/airtable";

export async function GET() {
  try {
    const records = await fetchAllRecords(TABLES.priceList, {
      fields: ["Назва", "ціна продажу", "ціна закупки", "% cалону", "група"],
      sort: [{ field: "Назва", direction: "asc" }],
    });

    const products = records.map((r) => ({
      id: r.id,
      name: (r.fields["Назва"] as string) || "",
      price: (r.fields["ціна продажу"] as number) || 0,
      costPrice: (r.fields["ціна закупки"] as number) || 0,
      salonPercent: (r.fields["% cалону"] as number) || 0,
      group: (r.fields["група"] as string) || "",
    }));

    return NextResponse.json(products);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
