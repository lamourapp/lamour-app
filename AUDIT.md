# Аудит проекту — 2026-04-25

## 🔴 Критичне (1)

### 1. Кешування Route Handlers в Next 16 — частково виправлено лише в `expense-types`
**Файли:**
- `src/app/api/owner/balances/route.ts`
- `src/app/api/materials/route.ts`
- `src/app/api/products/route.ts`
- `src/app/api/ownership/route.ts`
- `src/app/api/services-catalog/route.ts`
- `src/app/api/settings/route.ts`

**Контекст:** `expense-types/route.ts` вже ставить:
```ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
```
з коментарем «після PATCH клієнт просить GET — і отримує стару кеш-копію». Інші GET-роути, які НЕ читають `request.nextUrl.searchParams` (Next 16 робить динамічними лише такі), мають ту саму проблему.

**Проблема:** користувач архівує матеріал/товар/ревізію власників — а у списку він лишається, поки не зробити hard-reload. Симптом ідентичний тому, що вже зустрічався з expense-types.

**Фікс:** додати ту ж пару рядків у перелічені файли. `cache: "no-store"` з клієнта не рятує — це браузерний кеш, не серверний route cache.

---

## 🟡 Техборг (8)

### 2. Дві паралельні мапінгові логіки compensation-label
**Файл:** `src/lib/service-row.ts:65-77` vs `src/lib/compensation.ts:32-35`

Локальний `mapCompensationLabel()` мапить «власник» у `"commission"` (через default), а `compensationTypeFromLabel()` правильно — у `"owner"`.

**Проблема:** дублююча логіка з різною поведінкою. На pricing.ts зараз не впливає (owner не має ставок), але якщо додасться owner-кейс — тиха розбіжність.

**Фікс:** імпортувати `compensationTypeFromLabel` зі `compensation.ts`, видалити локальний мапер.

### 3. N+1 запитів до Airtable у POST /api/journal для multi-product продажу
**Файл:** `src/app/api/journal/route.ts:436-464`
```ts
for (const [idx, item] of saleItems.entries()) {
  const detail = await createRecord(TABLES.saleDetails, {...});
  detailIds.push(detail.id);
}
```
**Проблема:** продаж з 5 товарами = 5 послідовних запитів + 1 основний. Airtable rate-limit = 5 req/sec; паралельні продажі можуть отримати 429.

**Фікс:** `batchCreateRecords(TABLES.saleDetails, ...)` — він вже вміє пачки по 10.

### 4. ServiceEntryModal обходить хуки і робить свій власний fetch
**Файл:** `src/components/ServiceEntryModal.tsx:260-283, 525-535`

Прямий `fetch("/api/services-catalog")` + `fetch("/api/materials")` замість `useServicesCatalog()` / `useCatalog("materials")`.

**Проблема:** окремі вибірки кешу, відсутня cache-bust (`?_t=`), порожні дропдауни при відкритті після створення нового матеріалу.

**Фікс:** перейти на наявні хуки.

### 5. Master-edit на service/rental міняє `Майстра` без перерахунку snapshot-ставок
**Файл:** `src/app/api/journal/route.ts:622-626`
```ts
if (body.specialistId !== undefined) {
  fields[SERVICE_FIELDS.master] = body.specialistId ? [body.specialistId] : [];
}
```
**Проблема:** документація PATCH каже «склад не чіпаємо», але master міняється для всіх kinds, включно з service/rental. Lookup-поля перерахуються з нового майстра, а snapshot-и (`fixedMasterPayForService` тощо) лишаться старі — рядок стане неконсистентним по `pricing.ts`.

**Фікс:** для kind=service|rental або заборонити змінювати specialistId, або робити create-new + cancel-old (як ServiceEntryModal).

### 6. Артефактні `setTimeout` після створення/PATCH
**Файл:** `src/components/CreateEntryModal.tsx:213` (`setTimeout(resolve, 400)`), `:271` (`setTimeout(resolve, 800)`)

**Проблема:** магічні цифри щоб дочекатися, коли Airtable перерахує формули. Крихке: при повільному Airtable не вистачить, при швидкому — зайва затримка.

**Фікс:** довіритись `pricing.ts` (метрики обчислюються на сервері із сирих полів — Airtable-формули більше не критичні для UI).

### 7. `fetchRecords` без retry/backoff на 429
**Файл:** `src/lib/airtable.ts:82-95`

Падає одразу з `Airtable API error 429`.

**Проблема:** з rate limit 5 req/sec і паралельними `Promise.all` у `journal/route.ts` (7 fetchAllRecords одночасно) ризик 429 на холодному запиті реальний.

**Фікс:** простий retry з експоненційним backoff (1s/2s/4s) на 429/500.

### 8. owner/cash-history — UTC «сьогодні» замість локального
**Файл:** `src/app/api/owner/cash-history/route.ts:104-105`

`parseISODate(toISODate(new Date()))` — `toISODate` бере `.toISOString().slice(0,10)` (UTC).

**Проблема:** юзер у Києві після 03:00 — поверне «вчора» по локалі; точок на графіку буде на 1 менше.

**Фікс:** використати `todayISO()` з `lib/format.ts` (вже існує саме для цього).

### 9. Legacy single-product sale — `if (body.salePrice)` пропускає 0
**Файл:** `src/app/api/journal/route.ts:484-485, 536-537`

`if (body.salePrice) fields[...] = body.salePrice;`

**Проблема:** «безкоштовний бонусний товар» (salePrice=0) не запишеться. Multi-product гілка вже використовує `isFiniteNonNegative`.

**Фікс:** замінити на `if (body.salePrice !== undefined)` із валідацією через `isFiniteNonNegative`.

---

## 🟢 Дрібниці (3)

### 10. `s.isActive !== false` в клієнтських компонентах де `isActive` уже boolean
**Файли:**
- `src/app/preview/master/page.tsx:105`
- `src/components/OwnershipScreen.tsx:386`
- `src/components/StaffScreen.tsx:127`
- `src/components/SpecialistModal.tsx:529`

API `/api/specialists` нормалізує `isActive` як `f[...] === true`, тобто фронт завжди бачить boolean. Шаблон `!== false` був актуальний для сирого Airtable; на нормалізованому API це просто `s.isActive`.

**Фікс:** замінити на `s.isActive`.

### 11. Cache-busting через `?_t=` непослідовно
**Файл:** `src/lib/hooks.ts`

Є в `useCatalog`/`useServicesCatalog`/`useCategories`/`useExpenseTypes`/`useSpecializations`/`useSpecialists`/`useJournal`, **немає** в `useOwnership` (рядок 459).

**Фікс:** після додавання `force-dynamic` (пункт 1) — повністю прибрати всі `?_t=${Date.now()}`.

### 12. `services-catalog` PATCH пише `null` для активації, materials/products пишуть `false`
**Файли:**
- `src/app/api/services-catalog/route.ts:292`
- `src/app/api/materials/route.ts:120`
- `src/app/api/products/route.ts:98`

**Проблема:** обидва варіанти працюють, але непослідовність ускладнює майбутню міграцію на Postgres.

**Фікс:** уніфікувати на `false`.

---

## Статус виконання (станом на 2026-04-25)

- ✅ **п.1** — force-dynamic + revalidate=0 додано в 6 файлів + 3 додаткові
  (categories/specializations/specialists), які теж читаються через хуки.
  Коміт `b3184b8`.
- ✅ **п.2** — `mapCompensationLabel` видалено з `service-row.ts`,
  тепер через `compensationTypeFromLabel` з єдиним маппінгом «власник→owner».
  Для рядків журналу owner мапиться у commission (pricing.ts не знає owner).
- ✅ **п.3** — multi-product sale тепер використовує `batchCreateRecords`.
- ✅ **п.4** — ServiceEntryModal перейшов на `useServicesCatalog`/`useCatalog`.
- ⏸ **п.5** — для kind=service|rental блоковано зміну майстра у PATCH.
- ✅ **п.6** — додано 4 fixed-* снепшоти у Airtable (`Фікс. % салону за
  послугу`, `Фікс. % майстру за матеріали`, `Фікс. тип оплати`, `Фікс.
  К-сть годин`). POST `/api/journal` (kind=service) читає
  Співробітники один раз і пише снепшот; `service-row.ts` через
  `preferFixed()` бере fixed-* у першу чергу, lookup — як fallback
  для старих записів. Прибрано `setTimeout(400)` і `setTimeout(800)`
  у `CreateEntryModal.tsx` та `setTimeout(800)` у `ServiceEntryModal.tsx`.
- ✅ **п.7** — `fetchWithRetry` з backoff 1s/2s/4s на 429/5xx у
  `lib/airtable.ts`, поважаю Retry-After.
- ✅ **п.8** — cash-history приймає `?today=YYYY-MM-DD` від клієнта.
- ✅ **п.9** — `salePrice/costPrice === 0` тепер записуються (бонусні товари).
- ✅ **п.10** — `s.isActive !== false` → `s.isActive` у 4 файлах. У `Specialist`
  тип зробив `isActive: boolean` (не optional), бо API завжди нормалізує.
- ✅ **п.11** — `?_t=${Date.now()}` і `cache:"no-store"` прибрано з `lib/hooks.ts`.
- ✅ **п.12** — `services-catalog` PATCH пише `false` замість `null`.

## Нові пункти (виявлено після ревізії)

### 13. 🟡 SpecialistsBlock — назви колонок не відповідають змісту
**Файл:** `src/components/owner/SpecialistsBlock.tsx`

При перевірці на проді (квартал) числа дивні: «Денис перукар» оборот
4 000, майстру 160, чистий салону 4 713 (більше за оборот!). «Аліна
манікюр» оборот 1 000, майстру 1 130 (більше за оборот), чистий салону
1 170.

**Гіпотеза:** «Оборот» = `revenueServices` (тільки послуги), а «Чистий
салону» = `netSalon` (включає продажі товарів і матеріали). Тому
видається парадокс — насправді числа правильні, але колонка
«Оборот» вводить в оману.

**Фікс:** або (a) перейменувати колонку на «Послуги» / «Оборот послуг»,
або (b) показати окремо «Оборот» = всі джерела (послуги + матеріали +
продажі), щоб співвідношення було очевидним. Треба підтвердити з
juzerom яку семантику він очікує. Окрема задача.
