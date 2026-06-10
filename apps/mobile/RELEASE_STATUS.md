# PGManage Mobile — Release Status

> Living document. Update after every meaningful change. Treat as the single
> source of truth for "what's shipped / what's left / how to build."

---

## TL;DR

| Field | Value |
|------|-------|
| **App name** | PGManage |
| **Package id (Android)** | `com.pgmanage.app` |
| **Version / versionCode** | 1.0.0 / 1 |
| **Platform** | Android (primary), iOS (deferred — same RN codebase, ready to enable) |
| **Stack** | Expo SDK 51 · expo-router 3.5 · React Native 0.74.5 · TanStack Query v5 · Zustand · axios · i18n-js · expo-speech |
| **Backend** | `https://pgmanage.in/api/v1` (web prod). Override with `EXPO_PUBLIC_API_URL`. |
| **Distribution** | Sideload APK (EAS preview profile) for now. Play Store internal track when ready (`pgmanage.in` ownership verified by Caddy + DNS already). |
| **Code completion vs requirements doc** | **~70%** (foundations + all owner-staff critical flows; complaints / visitors / reports deferred — backend doesn't yet expose them). |
| **TypeScript clean** | ✅ (`npx tsc --noEmit` passes) |

---

## Phase 1 — Audit (Snapshot before the work)

Original tree had only auth/login + 5 placeholder tabs + tenant-portal. Token in
plaintext AsyncStorage, no refresh-token retry, no i18n, no design tokens, no
Settings screen, no Dashboard, no Notice handling, no payment-mode picker, no
WhatsApp receipt. Colour drift between screens (blue vs teal vs brand).

Detailed file-by-file inventory was preserved in commit history.

---

## Phase 2 — Foundation (done)

### Files added

| Path | Purpose |
|------|---------|
| `lib/theme.ts` | Design tokens — colors, spacing, type scale, 48dp touch targets, shadows. Brand colors lifted from the web app (slate-900 primary, teal-600 accent). |
| `lib/storage.ts` | Tiered storage: `secureStorage` (tokens, via expo-secure-store / Android Keystore) + `prefStorage` (user prefs, via AsyncStorage). |
| `lib/api.ts` (rewritten) | Axios client with bearer interceptor + **silent refresh-token retry on 401** + `getApiError` + `newIdempotencyKey` / `withIdempotency` helpers. |
| `lib/i18n.ts` | i18n-js with en / hi / te dictionaries; emoji-prefixed labels for semi-literate users; `setLocale` + `t()` helpers. |
| `lib/voice.ts` | `speak()` over expo-speech using current locale (en-IN / hi-IN / te-IN). |
| `lib/store.ts` (rewritten) | Single Zustand store for auth + selectedPropertyId + lang + simpleMode + voiceGuidance. Persists via AsyncStorage; tokens go through SecureStore. Exposes `useAppStore` (legacy `useAuthStore` aliased). |
| `components/ui.tsx` | Shared primitives — `Screen`, `Header`, `Card`, `KpiCard`, `Button`, `IconButton`, `Field`, `StatusPill`, `Empty`, `Loading`, plus `rupees(paise)` helper. |
| `assets/icon.png` etc. | Brand icon set generated from `apps/web/public/icon-192.svg`. |

### Design tokens at a glance

- **Touch target floor**: 48dp on every button / chip / row tap area.
- **Type scale**: caption 12 → small 13 → body 15 → bodyLg 17 → h3 18 → h2 22 → h1 26.
- **Bed colors** (per product spec): `bedVacant` green, `bedReserved` amber, `bedOccupied` brand teal, `bedMaintenance` red.

### Security upgrades

- Tokens moved from AsyncStorage → SecureStore (Android Keystore /
  iOS Keychain).
- 401 from any endpoint triggers **one** refresh attempt in a single
  in-flight promise; concurrent 401s share the same refresh result.
- Refresh failure clears tokens; `AuthGuard` then redirects to login.

---

## Phase 3 — Screens (done)

| Route | Implements | Mirrors web feature |
|-------|------------|--------------------|
| `/auth/login` | Email + password, tokens to SecureStore, auto-select first property. | `web/src/pages/auth/Login.tsx` |
| `/tabs/index` (Home) | KPIs from `/dashboard/summary`: occupancy %, vacant beds, today's collections, outstanding, check-ins/outs. Pull-to-refresh. Quick actions. | `DashboardPage` |
| `/tabs/tenants` (Residents) | List + search + status filter (Active / Notice given / Checked-out / All). Notice badges + outstanding-due chips. | `TenantsPage` |
| `/residents/[id]` | Profile · payments history · Give-Notice modal (set/edit/clear) · WhatsApp share. Replays the web NoticeDialog. | `TenantDetailPage` + `NoticeDialog` |
| `/payments/new` | Record-payment flow: tenant picker (or pre-selected), amount, mode (Cash / UPI / Bank), paid-to/by, reference, month/year. WhatsApp receipt share. Idempotency-Key. | `AddPaymentDialog` |
| `/tabs/rent` | Monthly ledger; month chip strip; status pills; tap-row → record payment. | `RentDashboardPage` |
| `/tabs/rooms` | Available now (green) + Upcoming vacancies (amber); legend with the 4 product colors; tenant-link on upcoming. | `PropertyDetailPage` Vacancies tab |
| `/tabs/more` (Settings) | User card, property switcher, language picker (en/hi/te), Simple Mode toggle, Voice guidance toggle, sign-out, version. | `Settings/*` |
| `/tabs/expenses` | Pre-existing 3-tap quick add — preserved from v0; not in the tab bar yet (hidden via `href: null` until receipt upload lands). | `ExpensesPage` |
| `/tenant-portal/index` | Pre-existing tenant OTP flow — out of scope today, kept working. | Tenant portal |

### Notable UX choices

- **One-handed**: Critical actions live in the bottom 2/3 of every screen.
  Header info is glance-only; primary action buttons are always full-width
  near the bottom.
- **Large fonts**: bodyLg (17) for primary content, h1 (26) for screen titles,
  amount inputs render in 20pt.
- **Maximum icons**: Every tab + action has an Ionicons glyph.
- **Voice guidance**: When enabled in Settings, screen titles are spoken on
  navigation in the chosen language.
- **Simple Mode**: Swaps verbose labels for friendly ones — "Record Payment"
  becomes "💰 Take Payment" in EN, "💰 पैसा लें" in HI, "💰 డబ్బు తీసుకోండి" in TE.

---

## Phase 4 — Build pipeline (done)

### Files added

| Path | Purpose |
|------|---------|
| `eas.json` | EAS Build profiles: `development` (debug APK), `preview` (release APK for sideload), `production` (AAB for Play Store), plus `submit` config. |
| `app.json` (updated) | Android permissions, `versionCode`, plugins (`expo-secure-store`, `expo-localization`, `expo-notifications`), notification icon colored brand teal. |
| `package.json` scripts | `typecheck`, `prebuild`, `build:debug:apk`, `build:release:apk`, `build:release:aab`, `build:eas:apk`, `build:eas:aab`. |

### Versioning strategy

- **`expo.version`** = semver, user-visible (`1.0.0`). Bump for every release.
- **`expo.android.versionCode`** = monotonic integer. EAS Build `production`
  profile has `autoIncrement: true`, so it bumps on every cloud build.
- Local gradle builds: bump `versionCode` in `app.json` by hand before
  running `./gradlew bundleRelease`.

### Signing strategy

| Path | Who manages |
|------|-------------|
| **EAS Build** | Expo manages the keystore. First build prompts to generate or upload one; reuse for every subsequent build. Keystore is recoverable via `eas credentials`. |
| **Local gradle** | You manage `android/app/release.keystore` + `~/.gradle/gradle.properties` with `PGMANAGE_RELEASE_STORE_FILE`, `PGMANAGE_RELEASE_STORE_PASSWORD`, etc. `expo prebuild` regenerates the native project on demand; keystore + props file live outside the regenerated tree. |

---

## Phase 5 — How to build the APK / AAB

There are **two paths**. Both produce the exact same code; pick based on
whether you have an Expo account + want cloud builds, or local Android SDK +
want offline builds.

### Path A — EAS Build (recommended, no local Android SDK needed)

One-time setup:

```bash
cd apps/mobile
npm i -g eas-cli                       # global, one-time
eas login                              # uses your Expo account
eas init                               # creates the EAS project + fills app.json's extra.eas.projectId
eas build:configure                    # confirms eas.json is OK (it already is)
```

#### Debug APK (developer build with menu / dev-client)

```bash
eas build --platform android --profile development
```

#### Release APK (preview profile — for sideload to your phone)

```bash
npm run build:eas:apk
# or
eas build --platform android --profile preview --non-interactive
```

EAS will queue the build, do it in the cloud, and give you a `.apk` download
URL when it's done (~15-20 min). The URL is also a QR you can scan from the
phone to install.

#### Release AAB (production profile — for Play Store)

```bash
npm run build:eas:aab
# or
eas build --platform android --profile production --non-interactive
```

### Path B — Local Android build (needs Android SDK + JDK 17)

One-time setup (if not already on this machine):

```bash
# 1. Install JDK 17 via Homebrew:
brew install --cask temurin@17
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home

# 2. Install Android command-line tools:
brew install --cask android-commandlinetools
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
```

Then:

```bash
cd apps/mobile

# Generate the native Android project from the Expo config (one-time per major
# config change; safe to re-run — it cleans + regenerates):
npm run prebuild

# Debug APK (no signing; for QA):
npm run build:debug:apk
# Output:  android/app/build/outputs/apk/debug/app-debug.apk

# Release APK (signed; needs release.keystore + gradle properties — see below):
npm run build:release:apk
# Output:  android/app/build/outputs/apk/release/app-release.apk

# Release AAB (signed; for Play Store):
npm run build:release:aab
# Output:  android/app/build/outputs/bundle/release/app-release.aab
```

#### One-time release-keystore setup (local path only)

```bash
cd apps/mobile/android
keytool -genkeypair -v -storetype PKCS12 \
        -keystore app/release.keystore \
        -alias pgmanage \
        -keyalg RSA -keysize 2048 -validity 10000
```

Add to `~/.gradle/gradle.properties` (NOT into the repo):

```
PGMANAGE_RELEASE_STORE_FILE=release.keystore
PGMANAGE_RELEASE_KEY_ALIAS=pgmanage
PGMANAGE_RELEASE_STORE_PASSWORD=<password>
PGMANAGE_RELEASE_KEY_PASSWORD=<password>
```

Then in `android/app/build.gradle` add the signing config under `android { … }`:

```gradle
signingConfigs {
  release {
    storeFile file(PGMANAGE_RELEASE_STORE_FILE)
    storePassword PGMANAGE_RELEASE_STORE_PASSWORD
    keyAlias PGMANAGE_RELEASE_KEY_ALIAS
    keyPassword PGMANAGE_RELEASE_KEY_PASSWORD
  }
}
buildTypes {
  release {
    signingConfig signingConfigs.release
    minifyEnabled true
    shrinkResources true
    proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
  }
}
```

`expo prebuild` regenerates `android/`, but it preserves `app/release.keystore`
and your gradle properties live outside the tree, so this setup survives.

### Verify the build

After either path produces an APK:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
# or, for EAS-built APK:
adb install -r ~/Downloads/pgmanage-1.0.0.apk
```

Smoke test on the device:

1. App launches, splash screen shows.
2. Sign in with your owner account.
3. Dashboard loads with KPIs.
4. Residents tab — list shows, search works, status filter "Notice given" works.
5. Tap a resident → detail loads → tap "Take Payment" → record a small test
   payment in Cash mode → success alert → WhatsApp share button appears.
6. Rooms tab — "Available now" + "Upcoming" sections render.
7. More → switch language to हिन्दी → tab labels change instantly.
8. More → Sign out → returns to login screen.

---

## Play Store submission checklist

Pre-requisites:

- [ ] Google Play Console account (₹2,000 / $25 one-time fee).
- [ ] Production keystore — DO NOT lose this. Lost keystore = forced new app id.
- [ ] App bundle (.aab) built via `npm run build:eas:aab` or
  `npm run build:release:aab`.
- [ ] Privacy policy URL — required for any app that collects user data. We
  have user names / phone numbers / payment details. Host it at e.g.
  `pgmanage.in/privacy` (web app to add; out of scope for this mobile session).
- [ ] App icon (512×512) — generated from `assets/icon.png`; export at 512 if
  you want a designer's polish.
- [ ] Feature graphic (1024×500) — needs designer.
- [ ] At least 2 phone screenshots and 1 tablet screenshot — take after first
  install on your device.
- [ ] App description (short ≤80 chars, full ≤4000 chars) — content TBD.
- [ ] Content rating questionnaire — answer truthfully (low-risk for a B2B
  property-management tool).
- [ ] Data safety form — declare what data we collect and why
  (account info, contact info via phone, financial info via payment records).
- [ ] Target API level — Expo SDK 51 targets API 34, well above Play Store's
  current minimum.

Submission flow:

```bash
# After running production build, EAS gives you an AAB URL.
# Either submit via the Play Console UI manually, or:
eas submit --platform android --profile production --latest
# (uses submit.production config in eas.json; needs the
# service-account JSON at ./play-store-key.json)
```

Track choices when uploading:

- **Internal testing** — fastest review (~hours). Use this first. Up to 100
  testers; share via opt-in URL.
- **Closed testing** — broader (Alpha). Tiny review.
- **Open testing** — public Beta. Reviewable.
- **Production** — full release. Initial review can take 1-7 days.

---

## A. Audit Report

See "Phase 1" above — preserved in commit `9293c29..HEAD` history for diff.

## B. Features Completed

- Auth: login, refresh-token retry, secure token storage, logout.
- Dashboard: occupancy %, vacant, today's collections, outstanding,
  check-ins/outs, pending rent.
- Residents: list, search, status filter (Active / Notice given /
  Checked-out / All), detail screen, payments history.
- Give Notice / Edit Notice / Clear Notice flow.
- Rooms: available-now + upcoming vacancies with the 4-color spec.
- Rent: monthly ledger, status pills, tap-row to record payment.
- Record Payment: amount, mode (Cash/UPI/Bank), paid-to/by, reference,
  month/year, idempotent submit, WhatsApp receipt share.
- Settings: user card, property switcher (multi-property), language
  picker (en/hi/te), Simple Mode toggle, Voice guidance toggle, sign out.
- i18n: en + hi + te dictionaries; emoji-prefixed Simple Mode strings.
- Design tokens enforced; 48dp tap-target floor; brand teal accent.

## C. Features Pending / Out-of-Scope for v1.0

| Item | Why deferred |
|------|--------------|
| Complaint Management | Backend has `/complaints` but no UI flow designed for staff yet. Trivial to add next round. |
| Visitor Management | No backend endpoints — needs new tables (`visitors`) + migration. |
| Reports | Web has dashboards; mobile equivalent is the dashboard tab for now. Custom reports later. |
| Push notifications | `expo-notifications` is wired in app.json plugins but not initialised; need an FCM project + a `/api/v1/devices/register` endpoint. Phase 2 mobile. |
| Crash reporting (Sentry) | Add `sentry-expo`, wrap RootLayout, set DSN via env. Phase 2 mobile. |
| Analytics | PostHog / Mixpanel SDK + event taxonomy. Phase 2 mobile. |
| Receipt upload on Expenses | UI placeholder exists; needs image picker + S3 presign call. |
| KYC document upload on Resident | Same as above — picker + presign + upload to existing `/tenants/{id}/id-proof` endpoint. |
| iOS build | Same code; needs Apple Developer account + provisioning. Same build pipeline. |
| Offline write queue | Reads work via React Query cache; writes (record payment, give notice) currently require connection. SQLite/MMKV queue is a phase 2 lift. |

## D. APK Path

- **EAS preview build**: URL returned by `eas build --profile preview`. Also
  shown as a QR in the terminal. Sideload via "Install from unknown sources"
  on Android.
- **Local gradle build**: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`
  (after `npm run prebuild && npm run build:release:apk`).

## E. AAB Path

- **EAS production build**: URL returned by `eas build --profile production`.
  Direct upload to Play Console; or `eas submit ... --latest`.
- **Local gradle build**: `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`
  (after `npm run prebuild && npm run build:release:aab`).

## F. Build commands

```bash
# Type-check
cd apps/mobile && npm run typecheck

# Cloud (EAS)
npm run build:eas:apk        # release APK
npm run build:eas:aab        # release AAB for Play

# Local (needs Android SDK + JDK 17)
npm run prebuild             # one-time per Expo config change
npm run build:debug:apk      # debug APK
npm run build:release:apk    # signed release APK
npm run build:release:aab    # signed release AAB
```

## G. Play Store Submission Guide

See "Play Store submission checklist" above. Recommended order:

1. Build the production AAB (`npm run build:eas:aab`).
2. Create the app in Play Console, fill metadata.
3. Upload AAB to **Internal testing** track first.
4. Add yourself as a tester, install via the opt-in URL.
5. Smoke-test on real device.
6. Once confident → promote to **Production** track.

---

## Known issues / follow-ups (next session)

1. **No EAS project id yet** — `app.json` `extra.eas.projectId` is blank.
   `eas init` will fill it. Until then `eas build` will prompt to create.
2. **Tenant portal screen** is untouched from v0 (works, but uses old styling).
   Out of staff-app critical path; revisit when polishing the tenant flow.
3. **Expenses tab** hidden from the bar (`href: null`) until receipt upload
   ships. Route still works if linked.
4. **No e2e tests** — Detox + Maestro candidates. Phase 2 mobile.
5. **No back-button handling** beyond expo-router defaults — fine for v1 stack
   navigation.

---

## Change log

| Date | What | By |
|------|------|----|
| 2026-06-07 | Phase 1 audit completed. | session#current |
| 2026-06-08 | Phase 2-5 shipped: foundation modules + 8 screens + build pipeline + this doc. TypeScript clean. | session#current |
| 2026-06-09 | i18n separator fix; Leads tab; More→Manage section; jest setup + 8/8 unit tests; MANUAL_TEST_PLAN. | session#current |
| 2026-06-10 | Dashboard correctness (real /dashboard/summary field mapping) + section switcher (Occupancy / Rent / P&L) gated to OWNER/PARTNER. Rent status filter (Unpaid/Partial/Paid/All). Take Payment rewritten as inline AddPayment with Type (Rent/Advance/Daily/Deposit/Refund/Other), inline tenant search, days, mode, paid-to/by, reference. Resident detail: Edit profile modal + ID-proof upload via expo-image-picker. Expenses: property_id param fix + Mine/Everyone scope filter (Everyone gated to OWNER/PARTNER). Bookings tab deferred. | session#current |
