// Airtable API client for Lamour
// Base: Lamour Claude Cone (appfAFxTcU6NOTNIZ)

const BASE_ID = "appfAFxTcU6NOTNIZ";
const API_URL = "https://api.airtable.com/v0";

function getToken(): string {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("AIRTABLE_TOKEN is not set");
  return token;
}

// Table IDs
export const TABLES = {
  services: "tblbscwomS21IlWy6",       // Послуги (journal)
  specialists: "tblsfMMvXdTp1DkjY",     // Співробітники
  servicesCatalog: "tblghXXUuVyGVqSv3", // Список послуг
  priceList: "tblhW7QGo6svDezGR",       // Прайс
  calculation: "tbl9NtGOpsE3XbdT4",     // Калькуляція
  orders: "tbl6WADNSFGrw6abz",          // Замовлення
  products: "tblthnCZzNrs9gJ1I",        // Товари
  clients: "tblhwRZKJeduhN7vE",         // Клієнти
} as const;

interface AirtableRecord {
  id: string;
  fields: Record<string, unknown>;
  createdTime: string;
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

export async function fetchRecords(
  tableId: string,
  options?: {
    filterByFormula?: string;
    sort?: { field: string; direction: "asc" | "desc" }[];
    maxRecords?: number;
    fields?: string[];
    offset?: string;
  }
): Promise<{ records: AirtableRecord[]; offset?: string }> {
  const params = new URLSearchParams();

  if (options?.filterByFormula) {
    params.set("filterByFormula", options.filterByFormula);
  }
  if (options?.sort) {
    options.sort.forEach((s, i) => {
      params.set(`sort[${i}][field]`, s.field);
      params.set(`sort[${i}][direction]`, s.direction);
    });
  }
  if (options?.maxRecords) {
    params.set("maxRecords", String(options.maxRecords));
  }
  if (options?.fields) {
    options.fields.forEach((f) => params.append("fields[]", f));
  }
  if (options?.offset) {
    params.set("offset", options.offset);
  }

  const url = `${API_URL}/${BASE_ID}/${tableId}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    next: { revalidate: 30 }, // cache for 30 seconds
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Airtable API error ${res.status}: ${error}`);
  }

  return res.json() as Promise<AirtableResponse>;
}

// Fetch all records (handles pagination)
export async function fetchAllRecords(
  tableId: string,
  options?: {
    filterByFormula?: string;
    sort?: { field: string; direction: "asc" | "desc" }[];
    fields?: string[];
  }
): Promise<AirtableRecord[]> {
  const all: AirtableRecord[] = [];
  let offset: string | undefined;

  do {
    const result = await fetchRecords(tableId, { ...options, offset });
    all.push(...result.records);
    offset = result.offset;
  } while (offset);

  return all;
}
