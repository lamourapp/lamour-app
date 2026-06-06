"use client";

import type { Settings } from "@/app/api/settings/route";
import { moneyFormatter } from "@/lib/format";

/**
 * Маржа матеріалів (товари + матеріали з послуг) за період.
 *
 * Окремий блок, щоб власник бачив "товарний" бізнес окремо від послуг:
 *  - Продано на (retail) = revenueMaterials (з послуг) + revenueSales (товари)
 *  - Собівартість = materialsCogs з обох
 *  - Чистий = revenue - cost
 *  - Маржа % = чистий / revenue
 *
 * Це інша оптика, ніж "Чистий салону" — там враховано і працю майстра.
 * Тут чисто про economic margin на матеріальних/товарних позиціях.
 */

interface Props {
  revenueMaterials: number;
  revenueSales: number;
  materialsCogs: number; // включає і matCost послуг, і costPrice продажів
  settings: Settings | null | undefined;
  loading: boolean;
}

export default function MaterialsMarginBlock({
  revenueMaterials,
  revenueSales,
  materialsCogs,
  settings,
  loading,
}: Props) {
  const money = moneyFormatter(settings);
  const revenue = revenueMaterials + revenueSales;
  const net = revenue - materialsCogs;
  const marginPct = revenue > 0 ? (net / revenue) * 100 : 0;
  const isEmpty = revenue === 0 && materialsCogs === 0;

  return (
    <div className="bg-white rounded-xl border border-black/[0.06] p-4 md:p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">Маржа матеріалів</h3>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Матеріали + товари — продаж vs собівартість
          </p>
        </div>
        {loading && <span className="text-[10px] text-gray-400">завантаження…</span>}
      </div>

      {isEmpty && !loading ? (
        <div className="text-center py-6 text-[12px] text-gray-400">
          Немає продажів матеріалів за період
        </div>
      ) : (
        <div className="space-y-2">
          <Row label="Продано (retail)" value={revenue} money={money} emphasis="strong" />
          {revenueMaterials > 0 && revenueSales > 0 && (
            <>
              <Row label="• з послуг (матеріали)" value={revenueMaterials} money={money} emphasis="muted" indent />
              <Row label="• з продажів (товари)" value={revenueSales} money={money} emphasis="muted" indent />
            </>
          )}
          <Row label="Собівартість" value={materialsCogs} money={money} sign="−" />
          <div className="border-t border-black/5 pt-2">
            <Row label="Чистий" value={net} money={money} emphasis="total" />
            <div className="flex justify-end mt-0.5">
              <span className={`text-[11px] tabular-nums ${marginPct >= 30 ? "text-emerald-600" : marginPct >= 15 ? "text-amber-600" : "text-red-500"}`}>
                маржа {marginPct.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, money, sign, emphasis = "normal", indent = false,
}: {
  label: string;
  value: number;
  money: (n: number) => string;
  sign?: "−";
  emphasis?: "normal" | "muted" | "strong" | "total";
  indent?: boolean;
}) {
  const label_cls = {
    normal: "text-[12px] text-gray-700",
    muted: "text-[11px] text-gray-500",
    strong: "text-[13px] font-medium text-gray-900",
    total: "text-[14px] font-semibold text-gray-900",
  }[emphasis];
  const value_cls = {
    normal: "text-[12px] text-gray-900 font-medium tabular-nums",
    muted: "text-[11px] text-gray-500 tabular-nums",
    strong: "text-[13px] text-gray-900 font-semibold tabular-nums",
    total: "text-[15px] text-gray-900 font-semibold tabular-nums",
  }[emphasis];
  return (
    <div className={`flex items-baseline justify-between ${indent ? "pl-3" : ""}`}>
      <span className={label_cls}>{label}</span>
      <span className={value_cls}>
        {sign === "−" && value !== 0 && <span className="text-gray-400 mr-0.5">−</span>}
        {money(value)}
      </span>
    </div>
  );
}
