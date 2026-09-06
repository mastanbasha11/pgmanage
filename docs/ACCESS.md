# Contributor access policy

How to add a developer who can **build, test, and modify** the web + mobile apps
locally and collaborate via pull requests — but **cannot merge to `main` or deploy
to production**.

The real production boundary is **credentials, not GitHub**: prod is hand-deployed
over SSH (`deploy-prod.yml` is disabled with `if: false`). A contributor who does
not hold the credentials in §3 cannot deploy by any path, regardless of their
GitHub role.

---

## 1. Invite the collaborator (owner, GitHub UI)

Settings → Collaborators and teams → **Add people** → choose role **Write**
(not Maintain/Admin).

Write lets them push feature branches, open PRs, and collaborate on shared
branches. Branch protection (§2) stops them merging to `main`.

## 2. Protect `main` (owner, GitHub UI)

Settings → Branches → **Add branch ruleset / rule** for `main`:

- [x] Require a pull request before merging → **Require 1 approving review**
- [x] **Require review from Code Owners** (uses `.github/CODEOWNERS`)
- [x] **Restrict who can push to matching branches** → list **only the owner**
      *(this is the control that prevents a contributor merging even an
      approved PR)*
- [x] Require status checks to pass → select the `backend.yml` and `web.yml`
      check jobs
- [x] Block force pushes and branch deletion
- [ ] (Optional) Include administrators

Net flow: contributor branches → pushes → opens PR → CI runs → **owner reviews
and merges**.

> Stricter alternative: give no repo access and have them work from a **fork**,
> opening PRs from it. Cleaner wall, less convenient for shared WIP branches.

## 3. Withhold — never share these (this is what blocks prod)

- Prod **SSH key** `~/.ssh/pgmanage_prod_ed25519`
- A slot in the **EC2 security-group IP whitelist** (they never SSH to prod)
- `/etc/pgmanage/.env` on the server
- **AWS credentials** (ECR / ECS / S3 / CloudFront)
- **EAS / Expo** account access (cloud builds + store submissions stay with the owner)

## 4. CI secret safety (owner, GitHub UI — do before adding real deploy secrets)

A Write collaborator can edit a workflow on their branch. Today this is low-risk
because CI test jobs use dummy secrets and the deploy jobs are disabled. **Before
populating any real deploy/AWS/SSH secrets:**

- Put them in a protected **Environment** named `production`
  (Settings → Environments) with **Required reviewers = owner** and
  **Deployment branch = `main` only**. Environment secrets are not exposed to
  arbitrary branch workflows.
- Settings → Actions → General → **Require approval for all outside / first-time
  contributors**.

---

## What the contributor CAN do locally (full dev + test)

Their own throwaway secrets only — no prod values.

```bash
git clone git@github.com:mastanbasha11/pgmanage.git && cd pgmanage
cp .env.example .env                       # fill with local values

# Infra
docker compose up -d postgres redis localstack

# Backend
cd apps/backend && poetry install
poetry run alembic upgrade head
poetry run python -m scripts.seed_demo     # demo org to click around

# Web + API (from repo root)
cd ../.. && npm install && npm run dev      # web :3000, api :8000

# Mobile (resident app) — local, no cloud needed
cd apps/mobile-tenant && npx expo start     # Expo Go or a local dev build
```

- **Mobile builds/submits (`eas build` / `eas submit`) stay with the owner** —
  not needed for local iteration.
- **Claude Code is per-developer**: they sign in with their own Anthropic
  account (never share). `CLAUDE.md` auto-loads the conventions; their memory is
  separate and does not travel with the repo.

## Day-to-day workflow

Branch off `main` → push feature branch → open PR → CI (`backend.yml` +
`web.yml`) must be green → owner reviews (CODEOWNERS) and merges → owner deploys
to prod. The contributor never deploys.
