# PGManage Mobile — Manual Test Plan

> Run after every EAS preview build. Tick each checkbox; anything that
> fails goes back to the engineer with a screenshot.

## Pre-flight

- [ ] APK installed cleanly (no signature mismatch warning if upgrading).
- [ ] First launch shows splash → login screen (no crash, no `[missing …]`
  labels visible anywhere — that's the i18n bug from 2026-06-09).

## 1. Auth

- [ ] Login screen renders: "Sign in to your account", Email + Password
  fields, "Sign In" button.
- [ ] Wrong password → red error box with backend message.
- [ ] Correct password → lands on **Home** (Dashboard) tab.

## 2. Dashboard (Home tab)

- [ ] Header says "Welcome, &lt;first-name&gt;".
- [ ] 6 KPI cards visible: Occupancy %, Vacant beds, Today's collections,
  Outstanding dues, Check-ins today, Check-outs today.
- [ ] Pull-to-refresh works (spinner appears, KPIs reload).
- [ ] Quick actions card has 5 buttons: Take Payment, Residents, Leads,
  Expenses, Rooms — each navigates to the right screen.

## 3. Tenants tab (Residents)

- [ ] List renders with all active tenants. Each row shows initials avatar,
  name, phone, room/bed, monthly rent.
- [ ] Search "asha" — only matching names show.
- [ ] Filter chips: Active / Notice given / Checked-out / All. Each filter
  filters the list correctly.
- [ ] Outstanding-due chip appears in red when a tenant has overdue rent.
- [ ] Notice chip shows when notice was given.
- [ ] Tap a tenant → opens Resident detail.

## 4. Resident detail

- [ ] Back arrow returns to list.
- [ ] Profile card shows status pill (green if ACTIVE), property, room,
  move-in date, rent, deposit.
- [ ] Notice banner appears if notice was given.
- [ ] Action buttons: **Take Payment**, **Give notice** / **Edit notice**,
  **WhatsApp**.
- [ ] Payments history list shows past payments with amount/mode/date.
- [ ] **Give notice** opens modal → fill in dates → Save → banner appears.
- [ ] **Clear notice** removes the notice.
- [ ] **WhatsApp** button opens WhatsApp with the tenant's number pre-filled.

## 5. Payments (Take Payment screen)

- [ ] Opens from Dashboard or Resident detail; pre-selects tenant when
  launched from a tenant.
- [ ] Amount input accepts numeric only.
- [ ] Mode buttons: Cash / UPI / Bank — toggling visibly highlights one.
- [ ] When UPI/Bank selected, "Reference / UPI ref #" field appears.
- [ ] Paid to / by free-text field saves.
- [ ] Month + Year defaults to current month.
- [ ] Save → success alert with "Share on WhatsApp" + "Done" buttons.
- [ ] WhatsApp share opens with a pre-filled receipt message.

## 6. Rent tab

- [ ] Month chip strip — current month is selected by default.
- [ ] Tap a different month → ledger updates.
- [ ] Outstanding banner shows total unpaid for that month (red).
- [ ] Each ledger row: tenant name, "Due ₹X,XXX", status pill (green PAID,
  amber PARTIAL, red UNPAID).
- [ ] UNPAID rows show outstanding amount on the right.
- [ ] Tap a row → opens Take Payment screen with tenant + month pre-filled.

## 7. Rooms tab

- [ ] Header shows "X now · Y upcoming".
- [ ] 4-colour legend: Vacant / Reserved / Occupied / Maintenance.
- [ ] "Available now" section (green) lists vacant beds with floor + price.
- [ ] "Upcoming vacancies" section (amber) lists beds where a tenant has
  given notice, with the vacate-date chip.
- [ ] Each upcoming card shows "X is vacating".

## 8. Leads tab (via Dashboard quick action or More → Manage)

- [ ] List renders with status pills (NEW / CONTACTED / etc.).
- [ ] Tap **Call** → opens phone dialer with the lead's number.
- [ ] Tap **WhatsApp** → opens WhatsApp with a pre-filled message.
- [ ] Empty state: "No leads yet" if list is empty.

## 9. Expenses tab (via Dashboard quick action or More → Manage)

- [ ] 3-tap quick-add flow: Category → Amount → Confirm.
- [ ] Recent expenses list renders below the add flow.
- [ ] Saved expense appears immediately at the top.

## 10. More tab (Settings)

- [ ] User card shows name, email, role.
- [ ] **Manage** card has 3 rows: Leads, Expenses, Rooms — each navigates.
- [ ] **Property switcher** appears if you have multiple properties; tapping
  one updates the selection across all tabs.
- [ ] **Language** picker: English / हिन्दी / తెలుగు. Tap हिन्दी → tab bar
  labels switch to Hindi, headers switch.
- [ ] **Simple Mode** toggle: ON → check that "Take Payment" stays "💰 पैसा लें"
  in Hindi etc.
- [ ] **Voice guidance** toggle: ON → switch tabs → device speaks the tab
  name in the current language.
- [ ] Version row shows the app version.
- [ ] Sign out → confirmation dialog → returns to login.

## 11. i18n regression catcher

- [ ] Visit every tab in English. **No label anywhere should say
  `[missing "..." translation]`**.
- [ ] Switch to Hindi. Tab bar + headers + buttons all change. Anything
  not translated falls back to English (not `[missing …]`).
- [ ] Switch to Telugu. Same expectation.

## 12. Error boundary

- [ ] Open the app in airplane mode with cleared cache. Sign-in attempt
  fails with a clear network error (not a blank screen, not a silent close).
- [ ] If a screen crashes (rare), the dark "⚠️ PGManage crashed" page
  appears with a Retry button — NOT a silent app close.

## 13. Auth persistence

- [ ] Close the app, reopen — you're still signed in (no re-login needed).
- [ ] Sign out → close app → reopen → lands on login screen.

## 14. Refresh-token

- [ ] After ~1 hour of usage, perform an action that hits the API. The
  request must succeed silently (refresh-token round-trip).
- [ ] No 401 popups, no forced re-login mid-session.

---

## Known not-yet-shipped (out of scope for v1)

- Complaint management
- Visitor management (no backend support either)
- Reports
- Push notifications
- KYC document upload
- Receipt upload on Expenses
- Offline write queue (reads cached via React Query; writes need connection)

## Definition of done for a build

- All boxes above ticked.
- 0 `[missing …]` labels anywhere.
- No silent app closes.
- All API calls succeed against `https://pgmanage.in/api/v1` with a valid
  account.
