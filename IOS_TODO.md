# iOS UI TODO — залишок після phase 1-3

Закрито в commit-ах: `49383c9` → `24847b2` → `62dad8a` → `ea8f0a2` → `614ed04` → `04efbf0` → `d481e26` → `db28392`.

Нижче — те, що НЕ зачеплено навмисно. Сюди дописувати все, що знайдемо в експлуатації.

---

## 🟡 Корисне, але не критичне

### 1. Застосувати `.ios-divider` у списках
**Стан:** хелпер додано в `globals.css`, нікуди не застосовано.

**Контекст:** на iOS списки використовують inset-роздільники (0.5px hairline rgba(60,60,67,0.18) з відступом зліва щоб не торкатись edge'у). У нас зараз або `border-b border-black/5`, або повна відсутність. Не критично — зараз і так читабельно — але косметично догнати.

**Де застосувати:**
- `JournalScreen.tsx` — між картками записів у one-day-у.
- `StaffScreen.tsx` — список співробітників.
- `CatalogScreen.tsx` / `ServicesCatalogScreen.tsx` — список товарів/послуг.
- `OwnershipScreen.tsx` — список власників.

**Як:** обернути ряд в `relative` і додати `<span className="ios-divider absolute left-4 right-0 bottom-0" />`. Останній ряд — без divider-а.

---

### 2. Bottom-sheet — стискається при появі клавіатури
**Стан:** не перевірено, потенційний баг.

**Контекст:** на iOS Safari при focus на input всередині bottom-sheet клавіатура виїжджає → viewport стискається → sheet може обрізатись зверху або кнопки внизу стати невидимими (під клавіатурою). Phase 3 додав swipe-handle і safe-area знизу, але keyboard-resize окремо не тестували.

**Як перевірити:** відкрити будь-який create-modal на iPhone, фокус у поле, побачити що:
- кнопка "Зберегти" не ховається під клавіатурою
- хедер залишається видимим

**Потенційне рішення:** `interactive-widget=resizes-content` у viewport meta або `visualViewport` listener що скейлить max-h модалу.

---

### 3. Pull-to-refresh у списках
**Стан:** немає.

**Контекст:** на iOS у нативних додатках (Mail, Reminders) звичка тягнути вниз від верху списку → refresh. У нас `useJournal`/`useStaff` ре-фетчать тільки при дії юзера або mount. Хороший iOS-feel, але коштує: треба компонент-обгортка з touch-tracking.

**Бібліотека:** `react-pull-to-refresh` або власне на основі `IntersectionObserver` (~50 LOC).

---

### 4. Tactile feedback у списках (`active:bg-gray-50`)
**Стан:** частково. Багато `<EntryCard>`/`<MasterCard>` мають hover-state але не active-state на тапі.

**Контекст:** на iOS при тапі на ряд списку він має миттєво показати press-state (як `UITableViewCell.selected`). У нас зараз тільки hover, який на touch-only пристроях не спрацьовує.

**Як:** sweep по `hover:bg-...` без `active:bg-...` у компонентах списків. Можна тим самим Node-патчером що і phase 3.

---

### 5. Safe-area для головного layout
**Стан:** Modal закрито, але основний UI — ні.

**Контекст:** якщо в нас зʼявиться bottom-nav (`Nav.tsx`), вона перекриватиметься home-bar. Поки що nav зверху → не критично, але якщо переїдемо на bottom-nav за iOS-конвенціями — треба `pb-[env(safe-area-inset-bottom)]` на корінному `<body>` або layout-обгортці.

---

### 6. `confirmDialog` — animate-toast-in для slide-up з низу
**Стан:** працює, але slide-down (toast-in) використано для slide-up dialog. Технічно ок, але іконка/анімація з різного напрямку.

**Як:** додати окрему `@keyframes sheet-up` з `from { translateY(20px) }` для confirm-діалогу — щоб і дайалог, і toast мали правильну фізику.

---

### 7. `BarcodeScanner` — torch-кнопка
**Стан:** немає.

**Контекст:** у поганому світлі сканер не може зчитати штрихкод. Native iOS Camera має кнопку ліхтарика. Через `MediaTrackConstraints.torch` доступне на Android Chrome, на iOS Safari **не підтримується** (станом на 2026). Можна додати кнопку з graceful-fallback (показувати тільки коли `track.getCapabilities().torch === true`).

---

### 8. PWA install prompt + offline shell
**Стан:** PWA працює (юзер інсталює "На головний екран"), але:
- немає кастомного install prompt-у (юзер не знає що можна інсталювати)
- немає `service worker` → офлайн повністю мертво
- іконка/splash-screen не оптимізовані під iOS

**Контекст:** для салону — критично щоб працювало без мережі (в підвалі/у дальньому кабінеті). Поки немає write-черги для офлайн-режиму, але хоча б read-кеш потрібен.

---

## ⚪ Стилістичне (low priority)

### 9. Dynamic Island / status-bar styling
**Стан:** дефолтне.

**Контекст:** на iPhone з Dynamic Island статусна стрічка зливається з білим тлом → виглядає рвано. Можна додати `<meta name="theme-color" content="#ffffff">` і `apple-mobile-web-app-status-bar-style=default`.

---

### 10. Custom font weight (`font-semibold` → SF Pro Display)
**Стан:** `-apple-system` дає правильний шрифт, але SF Pro має кілька варіантів (`Display` для >18pt, `Text` для <18pt). Браузер сам обирає, але можна явно через `font-stretch` або CSS-property. Marginal користь.

---

## 📋 Phase 4 (поки не починали)

Це вже не з UI-аудиту — це з MEMORY:
- **Auth система** (`lamour_auth_todo.md`) — сервіс відкритий; ролі (власник/адмін/майстер), провайдер, multi-tenant.
- **Розподіл прибутку** (`lamour_ownership_distribution_spec.md`) — N власників, частки, ревізії; майстер-власник з двома балансами.
- **Migration на Postgres** (`lamour_migration_notes.md`) — soft-delete/edit-as-recreate як технічний борг, legacy single-product sale ETL, Airtable checkbox quirk.

---

**Принцип:** дописувати сюди все, що помітимо в реальній роботі. Один пункт = один рядок з контекстом і де його зачепити. Файл живе в репо щоб не загубилось у memory-нотатках.
