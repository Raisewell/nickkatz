# Deployment

Target shape: **apps/web on Vercel**, **apps/api (+ worker, Postgres, Redis) on Railway** (Fly.io works
too — see the note at the bottom). Neither app is deployed anywhere yet.

## Important: this could not be executed or live-verified from the environment that wrote it

The sandboxed session that prepared this config has outbound network access blocked (403, at the
network-policy level, not a login/token problem) to `vercel.com`, `api.vercel.com`, `railway.app`,
`railway.com`, `fly.io`, and Docker Hub's image CDN (`production.cloudfront.docker.com`). That means:

- **No live deploy was attempted or is possible from that environment**, regardless of what API
  tokens are supplied — the network path to every one of these platforms is closed by policy, not by
  missing credentials.
- **The Docker images could not be built even locally** in that sandbox, because pulling the
  `node:22-slim` base image from Docker Hub hit the same block.

What *was* verified from that environment, directly, before this file was written:
- `pnpm --filter @raisely/web build` (the exact command the web Dockerfile and `vercel.json` both
  run) succeeds cleanly against the real codebase.
- `pnpm --filter @raisely/api build` (`tsc`) succeeds and produces `dist/index.js` + `dist/worker.js`.
- The `apps/web/Dockerfile` fix below (missing `prisma generate` step) was diagnosed by reading the
  Dockerfile against `apps/web/package.json`'s scripts and confirmed by running the equivalent
  commands directly, not by a full `docker build`.

Treat the Railway/Vercel-specific config below (`railway.json`, `vercel.json`, the exact dashboard
steps) as **carefully reasoned but operator-unverified** — the underlying app builds are solid, but
nobody has actually clicked through a Vercel or Railway deploy with these settings yet. Run through
this from a machine or CI runner with normal internet access, and expect to iron out one or two
platform-specific wrinkles the first time.

## Fixed while preparing this

`apps/web/Dockerfile` ran `pnpm --filter @raisely/web build` (`next build`) without first running
`pnpm --filter @raisely/web prisma:generate`. `apps/web` has its own Prisma client (the Auth.js
adapter tables, generated to `apps/web/src/generated/prisma-auth-client` — see that schema's own
comment for why it's a separate client from `apps/api`'s), which is gitignored and must be generated
at build time. Without the fix, the Docker image build fails as soon as anything imports
`@/lib/prisma`. `apps/api/Dockerfile` already had the equivalent step and needed no change.
`docker-compose.yml` builds from the same Dockerfile, so it had the identical latent bug.

`apps/api/src/index.ts` only read `API_PORT` (this repo's local-dev name), not the `PORT` variable
Railway/Fly/Heroku/Render all inject automatically. It now prefers `PORT`, falling back to
`API_PORT` then `4000`, so no manual port-variable mapping is needed on any of those platforms.

## Environment variables

`AUTH_SECRET` **must be the exact same value** on both services — apps/web mints a short-lived
bearer JWT from the NextAuth session, and apps/api verifies it independently against this shared
secret (see `apps/api/src/plugins/auth.ts`). Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Never set `AUTH_ENABLE_DEV_LOGIN` in a deployed environment — it registers a password-less
"sign in as any seeded user" provider (see `apps/web/src/auth.ts`), meant for local dev only.

### apps/api (Railway service: `api`, and a second service `worker` — see below)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Railway's Postgres plugin injects this automatically if referenced via its variable |
| `REDIS_URL` | Railway's Redis plugin injects this automatically if referenced via its variable |
| `AUTH_SECRET` | Must match apps/web's value exactly |
| `ANTHROPIC_API_KEY` | Optional — without it, thesis-match scoring and outreach drafting fall back to deterministic/templated behavior instead of failing |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `HEYREACH_API_KEY` | Optional — only needed for the HeyReach outreach destination |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` | Optional — without `STRIPE_SECRET_KEY`, `/billing/*` replies `503` rather than failing unpredictably |
| `PORT` | Railway (and Fly/Heroku/Render) inject this automatically; `apps/api/src/index.ts` now prefers `PORT` over `API_PORT` if both are set, so no manual mapping is needed |

### apps/web (Vercel project, Root Directory = `apps/web`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Same Postgres instance as the API — apps/web's own Prisma client only ever touches the four Auth.js tables (`users`, `accounts`, `sessions`, `verification_tokens`), which are the same tables apps/api's schema defines |
| `AUTH_SECRET` | Must match apps/api's value exactly |
| `AUTH_URL` | The deployed web app's own public URL, e.g. `https://raisely.vercel.app` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional — omit to disable Google sign-in; add the deployed `AUTH_URL` + `/api/auth/callback/google` as an authorized redirect URI in the Google Cloud Console |
| `EMAIL_SERVER`, `EMAIL_FROM` | Optional — omit to disable magic-link sign-in |
| `NEXT_PUBLIC_API_URL` | The deployed API's public URL, e.g. `https://raisely-api.up.railway.app` — this is a build-time value baked into the client bundle, so it must be set *before* the Vercel build runs, not just at runtime |

`AUTH_ENABLE_DEV_LOGIN` should be absent (or `"false"`) here — leaving it out entirely is safest,
since the provider genuinely doesn't register when unset rather than merely hiding in the UI.

## Steps: apps/api + worker + Postgres + Redis on Railway

1. Create a new Railway project. Add a **Postgres** plugin and a **Redis** plugin from Railway's
   template gallery — both are one-click, no config needed.
2. Add a service from this GitHub repo. **Root Directory must be the monorepo root** (not
   `apps/api`) — `apps/api/Dockerfile`'s `COPY` paths are relative to the repo root
   (`pnpm-workspace.yaml`, `packages/shared-types/...`), matching how it's built locally and in
   `docker-compose.yml`. Point Railway's build at `apps/api/railway.json` (already configured with
   `dockerfilePath: apps/api/Dockerfile`) so it doesn't need Railway's own Dockerfile auto-detection
   to guess correctly in a multi-app repo.
3. Set the environment variables from the table above. Reference the Postgres/Redis plugins'
   `DATABASE_URL`/`REDIS_URL` variables rather than typing connection strings by hand.
4. Before (or as part of) the first deploy, run migrations against the new database:
   ```bash
   railway run --service api pnpm --filter @raisely/api prisma:deploy
   ```
   Do this once per schema change going forward, same as any other migration-based deploy — it is
   not automatic on every push.
5. Duplicate the service (Railway: "Create → Duplicate service" from the `api` service, or add a
   second service pointed at the same repo/Dockerfile) to run the worker. Override its **Start
   Command** to `node dist/worker.js` (the Dockerfile's own `CMD` runs `dist/index.js`, i.e. the API
   server — the worker needs the override). Give it the same environment variables as `api`; it does
   not need a public port/domain.
6. Optionally seed demo data once, the same way as local dev:
   ```bash
   railway run --service api pnpm --filter @raisely/api prisma:seed
   ```

## Steps: apps/web on Vercel

1. Import this GitHub repo as a new Vercel project. Set **Root Directory** to `apps/web`.
   `apps/web/vercel.json` (already in the repo) overrides the install/build commands to `cd ../..`
   first so pnpm can see the whole workspace and build `@raisely/shared-types` (and generate the
   Auth.js Prisma client) before running `next build` — Vercel's default per-directory build
   wouldn't know to do either of those on its own.
2. Set the environment variables from the table above, for Production (and Preview, if you want PR
   previews to work — note Preview deploys would need their own `AUTH_URL`/OAuth redirect URI per
   preview domain, which Google OAuth doesn't support well; magic-link email sign-in degrades more
   gracefully across preview URLs).
3. Deploy. First deploy will fail fast and loudly if `AUTH_SECRET` or `NEXT_PUBLIC_API_URL` is
   missing — both are required for anything to render past the sign-in page.

## Post-deploy smoke test

1. Visit the deployed web URL — should redirect to `/sign-in` (confirms middleware + `AUTH_SECRET`
   are wired).
2. Sign in via whichever provider is configured. Confirm it lands on `/` (not a 404 — see the
   `sign-in-form.tsx` bug fixed earlier this session, which this same class of test would have
   caught).
3. Create a workspace, run a search. A `200` here confirms apps/web's bearer token
   (`/api/token`) → apps/api's `plugins/auth.ts` verification round-trip is working end to end, not
   just that each app boots independently.
4. Check `GET https://<api-url>/health` directly — should be reachable without a token (it's on the
   public-path allowlist).

## Fly.io as an alternative to Railway

The doc this plan came from leaves Railway vs. Fly.io open. Fly.io's shape is close enough that the
same Dockerfiles apply directly, but Fly's model is more manual: `fly postgres create` for a
Postgres cluster (a separate Fly app you attach), no first-party managed Redis (use Upstash's
Fly-integrated Redis, or Fly's own Redis-compatible offering if available in your org), and a
`fly.toml` with a `[processes]` block (`api = "node dist/index.js"`, `worker = "node dist/worker.js"`)
to run both from one Fly app instead of Railway's two-services approach. Nobody has written or
tested a `fly.toml` for this repo — if Railway turns out to be a poor fit, that's the next thing to
build, not something to assume already works.
