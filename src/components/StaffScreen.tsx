"use client";

import { useMemo, useState } from "react";
import { useSpecialists, useSettings, useSpecializations } from "@/lib/hooks";
import type { Specialist } from "@/lib/types";
import { moneyFormatter, currencySymbol } from "@/lib/format";
import { pluralizeTerm } from "@/lib/ua-plural";

type Fmt = (amount: number, opts?: { signed?: boolean; maximumFractionDigits?: number; minimumFractionDigits?: number }) => string;
import SpecialistModal from "./SpecialistModal";
import CreateEntryModal from "./CreateEntryModal";
import MasterReportModal from "./MasterReportModal";

function compensationLabel(s: Specialist, fmt: Fmt, sym: string): string {
  const materialsLabel = s.salesCommission > 0 ? ` · матер. ${s.salesCommission}%` : "";
  const salesLabel = s.productSalesCommission > 0 ? ` · продаж ${s.productSalesCommission}%` : "";
  // Для salary/hourly + dual-role (masterMode on) дописуємо «+ майстер X%»,
  // де X = частка майстра за послугу (100 − salonPctForService). Це видно
  // з (а) serviceCommission<100 — є майстерська частина з послуги, АБО
  // (б) будь-яка з комісій з матеріалів/продажів > 0.
  const isDualRoleMaster =
    (s.compensationType === "salary" || s.compensationType === "hourly") &&
    ((s.serviceCommission ?? 100) < 100 ||
      (s.salesCommission ?? 0) > 0 ||
      (s.productSalesCommission ?? 0) > 0);
  const masterSuffix = isDualRoleMaster
    ? ` · + майстер ${100 - (s.serviceCommission ?? 100)}%`
    : "";
  switch (s.compensationType) {
    case "commission":
      return `комісія ${s.serviceCommission}%${materialsLabel}${salesLabel}`;
    case "rental":
      return `оренда${s.rentalRate ? ` ${fmt(s.rentalRate)}` : ""}${materialsLabel}${salesLabel}`;
    case "hourly":
      return `погодинна ${s.hourlyRate ? `${fmt(s.hourlyRate)} ${sym}/год` : ""}${masterSuffix}${materialsLabel}${salesLabel}`;
    case "salary":
      return `ЗП ${s.salaryRate} ${sym}/день${masterSuffix}${materialsLabel}${salesLabel}`;
    case "owner":
      return "власник салону";
    default:
      return "";
  }
}

function avatarBg(color: Specialist["avatarColor"]): string {
  switch (color) {
    case "brand": return "bg-brand-50";
    case "amber": return "bg-amber-50";
    case "gray": return "bg-gray-100";
  }
}

function avatarText(color: Specialist["avatarColor"]): string {
  switch (color) {
    case "brand": return "text-brand-600";
    case "amber": return "text-amber-600";
    case "gray": return "text-gray-500";
  }
}

function compensationHighlight(type: Specialist["compensationType"]): string {
  switch (type) {
    case "rental": return "text-amber-600";
    case "salary": return "text-gray-500";
    default: return "";
  }
}

function BalanceDisplay({ balance, fmt }: { balance: number; fmt: Fmt }) {
  // Грошові залишки можуть накопичувати FP-хвіст (0.0000001) від сум через
  // відсотки. Строге === 0 не ловить — юзер бачив «-0,00». Порівнюємо в
  // копійках: якщо |balance| < 0.005 → це рівно нуль для відображення.
  const isZero = Math.abs(balance) < 0.005;
  if (isZero) {
    return <div className="text-[13px] font-semibold text-gray-400 tabular-nums">{fmt(0)}</div>;
  }
  if (balance > 0) {
    return <div className="text-[13px] font-semibold text-gray-900 tabular-nums">{fmt(balance, { signed: true })}</div>;
  }
  return <div className="text-[13px] font-semibold text-red-500 tabular-nums">{fmt(balance)}</div>;
}

export default function StaffScreen() {
  const [showInactive, setShowInactive] = useState(false);
  const { settings } = useSettings();
  const fmt = useMemo(() => moneyFormatter(settings), [settings]);
  const sym = currencySymbol(settings?.currency);
  const specialistTerm = settings?.specialistTerm || "Спеціаліст";
  const { specialists, loading, error, reload } = useSpecialists(showInactive);
  // include archived so names of archived linked specializations still render in labels
  const { specializations } = useSpecializations(true);

  // Resolve display label for a specialist's role(s) — joins names of linked
  // Спеціалізації.
  function roleLabel(s: Specialist): string {
    const ids = s.specializationIds || [];
    if (ids.length === 0) return "";
    const names = ids
      .map((id) => specializations.find((x) => x.id === id)?.name)
      .filter(Boolean) as string[];
    return names.join(" · ");
  }
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSpecialist, setEditingSpecialist] = useState<Specialist | null>(null);
  // «Розрахунок» = виплата ЗП / борг / аванс. Одна сутність (debt) під
  // різні use cases. Коли відкриваємо — пресет підставляє знак і суму
  // щоб закрити поточний баланс одним натиском.
  const [settlingSpecialist, setSettlingSpecialist] = useState<Specialist | null>(null);
  // Нарахування ЗП для salary/hourly — створює debt-рядок з debtSign="+" (салон
  // винен майстру). Префілена дата = сьогодні, сума = daily-rate (salary) або 0
  // (hourly — адмін ручно вводить години × ставку). Коментар «ЗП за DD.MM.YYYY».
  // Це мінімально-інвазивний варіант: НЕ вводимо нову сутність «нарахування»,
  // а перевикористовуємо існуючий механізм боргів (який вже коректно роутить
  // у балас через computeBalances). При міграції на Postgres — звичайний insert.
  const [accruingSpecialist, setAccruingSpecialist] = useState<Specialist | null>(null);
  // Звіт ЗП майстра за період — окремий модал-пікер, який відкриває
  // публічний URL /report/master/[id]. Не для власника.
  const [reportingSpecialist, setReportingSpecialist] = useState<Specialist | null>(null);

  // Показуємо всіх, хто має майстерську роль (тип оплати ≠ "власник").
  // Майстер-власник з'являється тут зі своїм master-балансом (ЗП за
  // послуги) — це потрібно адміну для розрахунку. Його owner-частина
  // прибутку — окремо на екрані «Налаштування → Власники салону» і сюди
  // не світиться (рендеримо s.balance = master part; ownerBalance не
  // чіпаємо). Лише «чисті» власники (compensationType = "owner") сховані.
  const activeList = specialists.filter(
    (s) => s.isActive && s.compensationType !== "owner",
  );
  const inactiveList = specialists.filter(
    (s) => !s.isActive && s.compensationType !== "owner",
  );

  function openCreate() {
    setEditingSpecialist(null);
    setModalOpen(true);
  }

  function openEdit(s: Specialist) {
    setEditingSpecialist(s);
    setModalOpen(true);
  }

  function handleSaved() {
    reload();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">{pluralizeTerm(specialistTerm)}</h2>
        <button
          onClick={openCreate}
          className="bg-brand-600 text-white rounded-[10px] font-medium text-[13px] px-4 py-2 cursor-pointer hover:bg-brand-700 transition-colors"
        >
          + Додати
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400 text-[13px]">Завантаження...</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-[13px]">Помилка: {error}</div>
      )}

      {/* Блок власників навмисно відсутній на цьому екрані. Дохід власника
          і кнопка «Вилучити» — на Налаштування → Власники салону, щоб
          майстри/адміни, які дивляться на команду, не бачили прибуток. */}

      {/* Active specialists */}
      <div className="space-y-1.5">
        {activeList.map((s) => {
          const label = compensationLabel(s, fmt, sym);
          const highlight = compensationHighlight(s.compensationType);

          return (
            <div
              key={s.id}
              onClick={() => openEdit(s)}
              className="bg-white rounded-xl border border-black/[0.06] px-4 py-3.5 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.99]"
            >
              {/* Row 1: avatar + name/role.
                  Mobile: + compact balance + chevron справа.
                  Desktop (sm+): + повна права частина (Д.Н., Баланс, чипи, chevron) — 1-рядковий layout як було. */}
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${avatarBg(s.avatarColor)} rounded-full flex items-center justify-center shrink-0`}>
                  <span className={`${avatarText(s.avatarColor)} font-semibold text-[13px]`}>
                    {s.name[0]}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {roleLabel(s)} ·{" "}
                    {highlight ? (
                      <span className={highlight}>{label}</span>
                    ) : (
                      label
                    )}
                  </div>
                </div>

                {/* Mobile-only: компактний баланс + chevron */}
                <div className="flex sm:hidden items-center gap-2 shrink-0">
                  <BalanceDisplay balance={s.balance} fmt={fmt} />
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>

                {/* Desktop-only: повна права частина (як було) */}
                <div className="hidden sm:flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">Д.Н.</div>
                    <div className="text-[12px] text-gray-500">{s.birthday || "—"}</div>
                  </div>
                  <div className="text-right w-[92px]">
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">Баланс</div>
                    <BalanceDisplay balance={s.balance} fmt={fmt} />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setReportingSpecialist(s); }}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white text-gray-600 hover:bg-gray-50 border border-black/[0.08] cursor-pointer transition-colors active:scale-[0.97]"
                    title="Звіт ЗП за період — публічне посилання"
                  >
                    Звіт
                  </button>
                  <div className="w-[52px] shrink-0 flex justify-center">
                    {s.compensationType === "salary" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setAccruingSpecialist(s); }}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors active:scale-[0.97]"
                        title="Нарахувати ЗП за день/період — створює запис у журналі"
                      >
                        + ЗП
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSettlingSpecialist(s); }}
                    className="shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 cursor-pointer transition-colors active:scale-[0.97]"
                    title="Розрахунок: виплата ЗП, аванс, борг"
                  >
                    Розрахунок
                  </button>
                  <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>

              {/* Row 2 (mobile only): action chips одним рядом — рівномірно
                  займають доступну ширину. «+ ЗП» рендериться тільки для
                  salary/hourly (нарахування ЗП — окрема операція від виплати,
                  тому окрема кнопка, а не пункт в Розрахунку). */}
              <div
                className="flex sm:hidden gap-2 mt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReportingSpecialist(s); }}
                  className="flex-1 h-9 rounded-lg text-[12px] font-medium bg-white text-gray-600 hover:bg-gray-50 border border-black/[0.08] cursor-pointer transition-colors active:scale-[0.97]"
                >
                  Звіт
                </button>
                {s.compensationType === "salary" && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setAccruingSpecialist(s); }}
                    className="flex-1 h-9 rounded-lg text-[12px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 cursor-pointer transition-colors active:scale-[0.97]"
                  >
                    + ЗП
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSettlingSpecialist(s); }}
                  className="flex-1 h-9 rounded-lg text-[12px] font-medium bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200 cursor-pointer transition-colors active:scale-[0.97]"
                >
                  Розрахунок
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Show inactive toggle */}
      {!loading && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="text-[12px] text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
          >
            {showInactive ? "Сховати неактивних" : "Показати неактивних"}
          </button>
        </div>
      )}

      {/* Inactive specialists */}
      {showInactive && inactiveList.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-gray-400 uppercase tracking-wider mb-2 px-1">Неактивні</div>
          <div className="space-y-1.5">
            {inactiveList.map((s) => {
              const label = compensationLabel(s, fmt, sym);

              return (
                <div
                  key={s.id}
                  onClick={() => openEdit(s)}
                  className="bg-gray-50 rounded-xl border border-black/[0.04] px-4 py-3.5 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] opacity-60 hover:opacity-80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-9 h-9 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-gray-400 font-semibold text-[13px]">
                          {s.name[0]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-gray-500 truncate">{s.name}</div>
                        <div className="text-[11px] text-gray-400 truncate">{roleLabel(s)} · {label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400 uppercase tracking-wider">Баланс</div>
                        <BalanceDisplay balance={s.balance} fmt={fmt} />
                      </div>
                      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <SpecialistModal
          specialist={editingSpecialist || undefined}
          onClose={() => { setModalOpen(false); setEditingSpecialist(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* Розрахунок з майстром. Пресет:
          • balance > 0 (ми винні) → знак «−», сума = balance (виплата ЗП/боргу)
          • balance < 0 (нам винні) → знак «+», сума = |balance| (майстер повертає)
          • balance = 0 → знак «+», сума 0 (нова операція з чистого листа)
          Всі цифри редаговані в модалі — пресет лише зекономлює кілька кліків. */}
      {settlingSpecialist && (
        <CreateEntryModal
          type="debt"
          specialists={specialists}
          onClose={() => setSettlingSpecialist(null)}
          onCreated={handleSaved}
          preset={{
            specialistId: settlingSpecialist.id,
            amount: Math.round(Math.abs(settlingSpecialist.balance || 0) * 100) / 100,
            debtSign: settlingSpecialist.balance > 0 ? "-" : "+",
            comment: settlingSpecialist.balance > 0 ? "Виплата ЗП" : "",
          }}
        />
      )}

      {reportingSpecialist && (
        <MasterReportModal
          specialist={reportingSpecialist}
          onClose={() => setReportingSpecialist(null)}
        />
      )}

      {/* Нарахування ЗП. Формула для пресету:
          • salary: денна ставка (salaryRate) — default припущення «нарахувати день»
          • hourly: 0 — адмін ручно вводить години×ставку
          debtSign="+" — салон став винен майстру більше (балас росте у плюс).
          Коментар фіксує дату, щоб в аудиті було видно «за що нарахували».
          Далі адмін може змінити будь-що в модалі (суму, коментар, дату). */}
      {accruingSpecialist && (
        <CreateEntryModal
          type="debt"
          specialists={specialists}
          onClose={() => setAccruingSpecialist(null)}
          onCreated={handleSaved}
          preset={{
            specialistId: accruingSpecialist.id,
            amount:
              accruingSpecialist.compensationType === "salary"
                ? accruingSpecialist.salaryRate || 0
                : 0,
            debtSign: "+",
            comment:
              accruingSpecialist.compensationType === "salary"
                ? `Нарахування ЗП (день) ${new Date().toLocaleDateString("uk-UA")}`
                : `Нарахування ЗП (погодинна) ${new Date().toLocaleDateString("uk-UA")}`,
          }}
        />
      )}
    </div>
  );
}
