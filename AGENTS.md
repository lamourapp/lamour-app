<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project conventions

### Date inputs — always `SingleDatePicker`

No `<input type="date">` or `<Input type="date">` anywhere in forms. Use
`<SingleDatePicker value={iso} onChange={setIso} />` from
`src/components/SingleDatePicker.tsx`. The native picker renders with OS
chrome and breaks visual consistency. If you add a new form with a date
field, reach for SingleDatePicker first — same API shape as the native
input (ISO `YYYY-MM-DD` in/out), drop-in replacement.

### Airtable checkbox fields — read as `=== true`, never `!== false`

Airtable omits the field from the API response when a checkbox is
unchecked (it does NOT return `false`). A mapper written
`f[key] !== false` therefore treats archived records as active. Use
`f[key] === true` (see `/api/expense-types`, `/api/categories`,
`/api/specializations`).
