# Substrata Monorepo

Substrata is an ECCN review assistant for semiconductor and advanced hardware teams. This repository now contains a multi-tenant compliance workspace with account sign-in, organization membership, document upload, classification review runs, memo drafting, invitations, and auditable human review tracking.

## Monorepo Layout

- `apps/web`: Next.js frontend
- `apps/api`: Express API
- `packages/db`: Prisma schema and database client
- `packages/shared`: shared TypeScript types and zod schemas
- `workers/classifier`: Python classification worker
- `docs`: product, architecture, compliance, and engineering docs
- `infra`: local infrastructure for development

## Authentication and Workspace Model

- The Express API is the authorization boundary for workspace data.
- Sessions are opaque, server-managed, and stored in Postgres as hashed tokens.
- Browser auth uses `httpOnly` session cookies plus CSRF protection for state-changing requests.
- New password users verify email before accessing workspace data.
- Google sign-in uses the OAuth authorization-code flow with the API as callback owner.
- Users belong to organizations through memberships with roles: `OWNER`, `ADMIN`, `REVIEWER`, `ANALYST`, `VIEWER`.
- Classification outputs remain draft analysis with recommended ECCN review paths and required human review.

## Frontend Workspace Notes

- The authenticated workspace lives under `/app` and uses server-guarded redirects for auth and onboarding.
- Auth pages redirect authenticated users back into `/app` or `/app/onboarding`.
- Unauthenticated access to `/app/*` is redirected to `/sign-in` with a safe return path.
- Mobile workspace navigation uses a drawer pattern; desktop uses a persistent sidebar.
- Review states are intentionally phrased as review workflow states, not final legal determinations.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set `SESSION_SECRET` before using sign-in flows.
3. Optional: configure Google OAuth and ZeptoMail if you want real Google sign-in or transactional email delivery.
4. Start Postgres:
  - `docker compose -f infra/docker-compose.yml up -d`
  - if your Docker install does not support `docker compose`, use `docker-compose -f infra/docker-compose.yml up -d`
5. Install JavaScript dependencies:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm install`
  - if the npm registry times out, retry the same command; `.npmrc` now increases retry/timeouts
6. Generate Prisma client:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm db:generate`
7. Create the development schema:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm db:migrate`
8. Seed the database with a development owner, reviewer, organization, sample document, completed classification run, citations, memo, human review record, and audit events:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm db:seed`
9. Start the API:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm dev:api`
10. Start the frontend in a second terminal:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm dev:web`
11. Optionally run both with one command:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm dev`
12. Run the sample Python worker locally:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm worker:sample`
13. Verify the API manually:
  - `COREPACK_HOME=/tmp/corepack corepack pnpm smoke:api`

## Environment Variables

- `APP_URL`: browser-facing web origin, used for verification, reset, and invite links.
- `API_URL`: browser-facing API origin.
- In Docker Compose production, `DATABASE_URL` must use the Compose service hostname `postgres`, not `localhost` or `127.0.0.1`. Example: `postgresql://USER:PASSWORD@postgres:5432/substrata?schema=public`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`: Google OAuth client settings. The redirect URI must exactly match the API callback route.
- `SESSION_SECRET`: required in any environment that uses real auth. Used to hash session and one-time auth tokens.
- `SESSION_COOKIE_NAME`: opaque session cookie name.
- `SESSION_COOKIE_DOMAIN`: required in production when the web app and API run on different subdomains and should share session cookies.
- `PUBLIC_DEMO_ADMIN_EMAILS`: comma-separated internal email allowlist for public demo publishing. In production, the first demo publisher should be on this allowlist and also hold an `OWNER` or `ADMIN` membership in the internal Substrata workspace.
- `ZEPTO_MAIL_API_TOKEN`: ZeptoMail HTTP API token for transactional email.
- `EMAIL_FROM`: verified sender used for auth and invite mail.

## Acceptance Paths

- API health: `GET http://localhost:4000/health`
- Sign in: `http://localhost:3000/sign-in`
- Sign up: `http://localhost:3000/sign-up`
- Verify email: `http://localhost:3000/verify-email`
- Workspace overview: `http://localhost:3000/app`
- Upload flow: `http://localhost:3000/app/documents/new`
- Seeded document: `http://localhost:3000/app/documents/doc_seed_orion_x7`
- Seeded run: `http://localhost:3000/app/reviews/run_seed_orion_x7`
- Worker sample output: `workers/classifier/samples/output-sample.json`

## Demo Workflow

1. Open `http://localhost:3000/sign-in`.
2. Seeded local users after `pnpm db:seed`:
   - `owner@substrata.local / SubstrataDemoPass123!`
   - `reviewer@substrata.local / SubstrataDemoPass123!`
3. Open the workspace overview and review queue.
4. Upload a PDF or text datasheet, or use the seeded sample document.
5. Open the document and start a classification review.
6. Review extracted technical facts, recommended ECCN review paths, citations, uncertainty flags, and the memo draft.
7. Record a human review decision from the review page.
8. Invite a teammate from the Team page if email delivery is configured.

## Public Demo Run

- The canonical public demo URL uses the existing classification-run route: `/classification-runs/:runId`.
- A run is never public by default. Anonymous access succeeds only for the one actively published demo run.
- Public responses use a sanitized projection and exclude workspace IDs, user data, storage paths, artifact paths, signed URLs, and audit details.
- In production, configure the first demo admin by setting `PUBLIC_DEMO_ADMIN_EMAILS` to the internal operator email and ensuring that user also has an `OWNER` or `ADMIN` membership in the internal workspace.

### Admin Runbook

1. Deploy the API, web app, and Prisma migration.
2. Sign in as a configured public demo admin.
3. Upload only a public, cleared-for-sharing PDF. Do not publish confidential, customer, personal, export-controlled, or sensitive documents.
4. Run a normal classification and wait for the run to complete.
5. Review the extracted technical facts, cited review paths, uncertainty flags, and classification memo draft.
6. Open the completed run detail page and click `Publish as public demo`.
7. Complete the public-sharing attestation and optional public presentation fields, then confirm.
8. Open the canonical public URL in an incognito browser and verify the standalone preview loads without authentication.
9. Later, publish a different completed run to replace the current demo or use `Unpublish demo` to remove public access.

## Frontend Validation Status

- Lint and full monorepo typecheck pass.
- The web production build completes compile, lint/typecheck, and static-page generation, but in this environment it may stall at `Collecting build traces ...` instead of exiting cleanly.
- Browser-tested unauthenticated flows include:
  - `/sign-in`
  - `/sign-up`
  - `/forgot-password`
  - `/reset-password`
  - `/auth/callback`
  - unauthenticated redirect from `/app`
- Authenticated browser validation currently depends on a working local Postgres connection. If the API cannot connect to Postgres, sign-in will fail and authenticated route smoke tests cannot complete.

## Notes

- Human review is mandatory for every classification output.
- The upload flow stores original files locally and extracts PDF text with local tooling when available.
- Jungle Grid is a future execution target; local execution is the MVP default.
- Google OAuth and ZeptoMail require manual dashboard setup and verified sender/client configuration outside the repository.
