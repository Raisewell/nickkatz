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
pnpm --filter @raisely/api worker   # separate process: consumes background jobs (thesis-match scoring)
```

Set `ANTHROPIC_API_KEY` in `apps/api/.env` for the worker to actually call Claude; without it, thesis_match
falls back to the naive keyword-overlap heuristic everywhere and the cache just stays empty.

### Running api tests

The api's integration tests hit a real Postgres database (not mocks) so exclusion filtering and
search ranking are verified end to end. They run against a separate `raisely_test` database,
configured via `apps/api/.env.test`:

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
- [ ] Phase 4 - Lookalike discovery
- [ ] Phase 5 - Warm paths and outreach
- [ ] Phase 6 - Billing, compliance, polish

## Demo data (after seeding)

- Workspaces: `acme-fintech` (founder), `portco-alpha` + `portco-beta` (advisor, demonstrating one
  user across many workspaces)
- 200 investors, 393 contacts, 867 deals
- A saved Search ("B2B fintech seed - London") with 3 Leads showing the full fit-score evidence
  contract: a strong match (score 84), a conflict-flagged investor, and a freshness-decayed investor
- One WarmPath from a lead's contact
