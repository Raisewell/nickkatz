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

- API: http://localhost:4000
- Web: http://localhost:3000

### Option B: Local dev (Postgres/Redis running natively)

```bash
pnpm install
cp .env.example apps/api/.env   # adjust DATABASE_URL/REDIS_URL if needed
pnpm --filter @raisely/api prisma:migrate
pnpm --filter @raisely/api prisma:seed
pnpm dev   # runs api + web in parallel
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
- [ ] Phase 2 - Search core (query refiner, search execution, Firm Finder, saved searches, exclusion filtering)
- [ ] Phase 3 - Explainable fit scoring
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
