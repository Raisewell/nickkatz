FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter @raisely/api... --filter @raisely/shared-types

FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @raisely/shared-types build
RUN pnpm --filter @raisely/api prisma:generate
RUN pnpm --filter @raisely/api build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared-types ./packages/shared-types
COPY --from=build /repo/apps/api ./apps/api
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
