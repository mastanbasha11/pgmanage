# Mobile release runbook — both apps, both stores

Two Expo apps, published in parallel to Google Play and the Apple App Store.

| App | Dir | Bundle ID / package | EAS project | Store name |
|---|---|---|---|---|
| Owner / staff | `apps/mobile` | `com.pgmanage.app` | `a7540728-…` | **PGManage** |
| Resident | `apps/mobile-tenant` | `in.pgmanage.resident` | `aba700fd-…` | **PGManage Resident** |

Both point at the API host `https://app.pgmanage.in/api/v1`. Both use EAS-managed signing.

## 0. One-time prerequisites
- ✅ Google Play + Apple Developer accounts (done)
- ✅ Privacy policy URL: `https://pgmanage.in/privacy`
- **EAS CLI + login:** `npm i -g eas-cli && eas login`
- **Assets to prepare (per app):** phone screenshots (both stores), and for Play a **512×512 icon** + **1024×500 feature graphic**; short + full description; a **support email/URL**.
- **Reviewer test logins** — both stores require working credentials because login is gated:
  - Staff app → a real owner/staff account (email + password) on `app.pgmanage.in`.
  - Resident app → a resident phone that can receive the OTP (or a demo resident + the dev OTP path).

## 1. Fill the store identifiers (once app records exist)

### Apple — create both app records first
App Store Connect → **Apps → + → New App** for each bundle ID. Then note:
- **Team ID** (same for both): developer.apple.com → **Membership**.
- **ascAppId** (per app): the app's **Apple ID** number under **App Information**.

Put them in each `eas.json` → `submit.production.ios` (currently `REPLACE_WITH_…`):
- `apps/mobile/eas.json` — `ascAppId`, `appleTeamId` (appleId already `pgmanage9@gmail.com`)
- `apps/mobile-tenant/eas.json` — same two fields

> If a bundle ID isn't offered when creating the app, register it first under
> developer.apple.com → **Identifiers → +**.

### Google — create both app records
Play Console → **Create app** for each (PGManage, PGManage Resident).
- First upload can be done **by hand** (drag the AAB into Internal testing) — no key needed.
- To automate `eas submit`: Play Console → **Setup → API access** → link a Google Cloud project →
  create a **service account** → download its **JSON key** → save as `play-store-key.json` in each
  app dir (gitignored) → grant the account **Release** permission in **Users & permissions**.

## 2. Build (run per app)
```bash
cd apps/mobile            # then repeat in apps/mobile-tenant
eas build --platform all --profile production      # or: --platform android | ios
```
- Android → `.aab`; iOS → EAS creates the distribution cert + provisioning profile (asks for the
  Apple login once) and produces an `.ipa`.
- `autoIncrement` bumps build numbers automatically.

## 3. Submit (run per app)
```bash
eas submit --platform android --profile production   # needs play-store-key.json (or upload by hand)
eas submit --platform ios --profile production        # needs the ascAppId + appleTeamId filled
```

## 4. Finish the listings
**Play (per app):** store listing (icon, feature graphic, screenshots, descriptions), **content
rating** questionnaire, **Data safety** form (declare: name, phone, financial info, and — staff app
only — photos), target audience, privacy URL. Then **Internal testing → Closed testing → Production**.
> Personal Play accounts must run a **14-day / 20-tester closed test** before Production. Add
> testers by email on the closed track. Org accounts skip this but need D-U-N-S.

**App Store (per app):** screenshots, description, keywords, support URL, the **App Privacy**
questionnaire, then **Add for Review → Submit**. First review is typically 24–48h.

## Gotchas already handled in config
- iOS export-compliance prompt skipped (`ITSAppUsesNonExemptEncryption: false` in both `app.json`s).
- Staff app declares camera + photo-library usage strings (receipt/doc capture). The resident app's
  ID-proof screen is a **placeholder today** — when it gains a real image picker, add
  `expo-image-picker` + its `photosPermission`/`cameraPermission` before the next iOS build.
- API host is `app.pgmanage.in` (the apex still proxies `/api`, so older builds keep working).

## Version bumps for later releases
Bump `version` (and it drives `buildNumber`/`versionCode` via `appVersion` runtime policy) in each
`app.json`; `autoIncrement` handles the store build number. Rebuild → resubmit.
