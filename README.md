# Raisely

AI-powered investor discovery and fundraising CRM for founders and advisors.

## Stack

- **API:** Node.js + TypeScript, Fastify, PostgreSQL via Prisma, BullMQ + Redis for background jobs
- **Web:** Next.js 14 (App Router) + TypeScript, Tailwind, shadcn/ui-style components, TanStack Query
- **AI:** Anthropic API (`claude-sonnet-4-6`) for query parsing, fit scoring, and outreach drafting
- **Auth:** Auth.js (email magic link + Google OAuth) — Prisma adapter tables are in the schema; wiring lands in a later phase
- **Infra:** Docker Compose for local dev (postgres, redis, api, web)

## Monorepo layout

```
apps/
  api/    Fastify backend, Prisma schema + migrations + seed script
  web/    Next.js frontend
packages/
  shared-types/   Types shared between api and web (enums, StructuredQuery, FitScoreResult, ...)
  raise-fis/      Standalone CLI for RAISE FIS V1 (investor call extraction + pattern-detection insight
                  engine) - no database, no server; see packages/raise-fis/README.md
```

## Getting started

### Option A: Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:4000 (OpenAPI docs at `/docs`)
- Web: http://localhost:3000

### Option B: Local dev (Postgres/Redis running natively)

```bash
pnpm install
cp .env.example apps/api/.env   # adjust DATABASE_URL/REDIS_URL if needed
pnpm --filter @raisely/api prisma:migrate
pnpm --filter @raisely/api prisma:seed
pnpm dev   # runs api + web in parallel
pnpm --filter @raisely/api worker   # separate process: consumes all background jobs
```

Set `ANTHROPIC_API_KEY` in `apps/api/.env` for the worker to actually call Claude (thesis_match
scoring) and for outreach drafting to produce real Claude-written drafts; without it, both fall back
to deterministic/templated behavior rather than failing. Set `HEYREACH_API_KEY` to actually send
through the HeyReach adapter. Set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_STARTER`/
`STRIPE_PRICE_PRO` for `/billing/*` to work; without `STRIPE_SECRET_KEY` those routes reply `503`
instead of failing unpredictably. Forward Stripe events to your local API with the Stripe CLI:
`stripe listen --forward-to localhost:4000/webhooks/stripe` (it prints the webhook signing secret to
put in `STRIPE_WEBHOOK_SECRET`).

### Running api tests

The api's integration tests hit a real Postgres database and a real Redis instance (not mocks) so
exclusion filtering, search ranking, and background job enqueueing/webhook delivery are verified
end to end. They run against a separate `raisely_test` database and Redis logical DB 1 (so test
runs never collide with jobs queued by a locally running dev worker), configured via
`apps/api/.env.test`:

```bash
sudo -u postgres createdb -O raisely raisely_test   # once
DATABASE_URL=postgresql://raisely:raisely@localhost:5432/raisely_test pnpm --filter @raisely/api prisma:deploy
pnpm --filter @raisely/api test
```

## Scripts (from repo root)

| Command | Description |
| --- | --- |
| `pnpm dev` | Run api + web in watch mode |
| `pnpm build` | Build all packages/apps |
| `pnpm test` | Run all test suites |
| `pnpm typecheck` | Typecheck all packages/apps |
| `pnpm lint` | Lint all packages/apps |
| `pnpm prisma:migrate` | Run Prisma migrations for the API |
| `pnpm prisma:seed` | Seed ~200 fake investors + demo workspace data |

## Phase status

- [x] **Phase 1 - Data model and scaffold.** Prisma schema for all core models (User, Workspace,
      Investor, Contact, Deal, Search, Lead, ExclusionList/Entry, EnrichmentJob, DiscoveryRun,
      WarmPath, UsageEvent), Auth.js adapter tables, Fastify + Next.js skeletons wired together,
      Docker Compose, and a seed script producing 200 investors that exercise every fit-scoring
      factor plus a conflict flag and a warm path.
- [x] **Phase 2 - Search core.** `POST /searches/refine` (Claude-backed NL -> StructuredQuery, Zod
      validated with a keyword-based fallback), `POST /searches` (SQL filtering + exclusion
      filtering + fit-score ranking, doubles as Firm Finder when called without `queryText`),
      saved searches (list/get/rename/rerun/delete), exclusion lists with CSV + LinkedIn
      `Connections.csv` upload (auto-detected), and every search reporting how many results were
      hidden by the workspace's exclusion lists. OpenAPI docs at `/docs`.
- [x] **Phase 3 - Explainable fit scoring.** `thesis_match` is now Claude-scored: a BullMQ worker
      (`pnpm --filter @raisely/api worker`) consumes batched jobs, scores every investor in one
      Claude call against the search's sectors/keywords, and caches results in `ThesisMatchScore`
      keyed by `(investorId, queryHash)`. Search execution checks that cache first; any investor
      without a cached score gets the naive keyword-overlap fallback immediately (never blocks the
      request) and is queued for background scoring so the next search with the same signal is
      fully Claude-scored. Freshness now decays when an investor's most recent deal is >24 months
      old, on top of the fund-close boost. Conflict detection compares
      `structuredQuery.excludeCompetitorsOf` against each investor's `Deal.company` and attaches a
      `conflict` flag - deliberately narrow (named companies only) so ordinary sector-matching
      deals, which are a *positive* signal elsewhere, aren't mistaken for conflicts.
- [x] **Phase 4 - Lookalike discovery.** `POST /discovery` (3-10 comparable companies) creates a
      `DiscoveryRun` and returns immediately; a background job finds direct matches in the Deal
      table, expands one hop via the co-investment graph (other investors who share a portfolio
      company with a direct match), scores and dedupes, and sets the run to `AWAITING_APPROVAL`
      with a preview list. `POST /discovery/:id/approve` runs enrichment for the approved firms and
      merges them into a new Search (reusing the Phase 2/3 scoring pipeline via a new
      `investorIdsOverride`). Every status transition (QUEUED -> RUNNING -> AWAITING_APPROVAL ->
      APPROVED -> COMPLETE/FAILED) is enforced by a Postgres trigger (not just app code) and emits
      both an in-app Notification (pushed live over `GET /notifications/stream`, an SSE endpoint -
      no client polling required) and an HMAC-signed webhook to every registered
      `WebhookEndpoint`. `GET /discovery/:id` remains available as a polling-compatible fallback.
- [x] **Phase 5 - Warm paths and outreach.** `NetworkContact` import (`POST /network-contacts/import`,
      reusing the Phase 2 LinkedIn CSV parser, now also capturing the "Connected On" recency hint)
      feeds `POST /warm-paths/compute`, which matches the founder's own connections directly against
      an investor's contacts (by email/LinkedIn) and scores the path by connection recency -
      `verified: true` when we have a real date, `false` otherwise. True 2nd-degree "mutual" paths
      would need the target contact's own connection graph, which we don't have access to, so those
      are captured via `POST /warm-paths` (free-text manual entry) instead of invented. The best warm
      path per lead surfaces on `GET /searches/:id`'s lead cards. `POST /leads/:id/draft` drafts a
      personalized first line + email via Claude from the lead's fit evidence and the workspace's
      `companyOneLiner`, persisted as an editable `OutreachDraft` (`PATCH /outreach-drafts/:id`) -
      nothing is ever sent automatically. An `OutreachDestination` adapter pattern
      (`src/services/outreach-destinations/`) backs `POST /outreach/send`: CSV export is fully
      implemented, HeyReach is fully implemented against its real public API (verified via its
      open-source CLI client's source, since HeyReach's own docs site blocks automated fetches -
      `X-API-KEY` auth, `POST /campaign/AddLeadsToCampaignV2`), and Instantly/Smartlead/HubSpot/Attio/
      Affinity are typed stubs that return 501 rather than pretending to send. `POST /round-plan`
      suggests a target list size from a stage/round-size rule-of-thumb table, and
      `POST /searches/:id/tier` auto-tiers a search's leads A/B/C by fit-score percentile
      (`PATCH /leads/:id` updates pipeline stage/tier/tags for a Kanban board's drag-and-drop - the
      board itself is a frontend task, not built yet since this phase has been backend-focused).
- [x] **Phase 6 - Billing and compliance (backend).** Stripe subscription billing:
      `GET /billing` (plan/usage/subscription status), `GET /billing/plans` (catalog),
      `POST /billing/checkout` (Stripe Checkout session, creates/reuses a Stripe Customer),
      `POST /billing/portal` (Stripe billing portal session), and `POST /webhooks/stripe`
      (signature-verified, updates `Workspace.plan`/`usageLimit`/`subscriptionStatus` from
      `checkout.session.completed` and `customer.subscription.*` events - the workspace id
      travels in `client_reference_id`/`subscription.metadata` so lookups don't depend on
      webhook delivery order). Plan-gating itself (`recordUsageIfAllowed`,
      `route-usage.ts`) already existed from Phase 2/5 and needed no changes - Stripe just
      drives `usageLimit` now instead of it being static. GDPR/CCPA compliance:
      `POST /workspaces/:id/export` (full data portability dump, webhook secrets redacted)
      and `POST /workspaces/:id/delete-request` (right to erasure, owner-only, relies on
      the schema's cascade deletes) - distinct from the pre-existing `/opt-out` endpoint,
      which is erasure for third-party investor Contacts, not a workspace's own data.
      Frontend billing/settings UI and a general polish pass remain (see below).

## Demo data (after seeding)

- Workspaces: `acme-fintech` (founder), `portco-alpha` + `portco-beta` (advisor, demonstrating one
  user across many workspaces)
- 200 investors, 393 contacts, 867 deals
- A saved Search ("B2B fintech seed - London") with 3 Leads showing the full fit-score evidence
  contract: a strong match (score 84), a conflict-flagged investor, and a freshness-decayed investor
- One WarmPath from a lead's contact
