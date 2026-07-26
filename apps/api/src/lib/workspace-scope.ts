import type { PrismaClient } from "@prisma/client";

/**
 * Every Prisma model that carries its own `workspaceId` column. This is the
 * single source of truth the workspace-isolation extension enforces against -
 * every model here gets automatically filtered/stamped on every query, so a
 * handler that forgets a `where: { workspaceId }` clause fails closed
 * (returns nothing / affects nothing) instead of leaking another tenant's
 * data. Models NOT in this set (Investor, Contact, Deal, ThesisMatchScore,
 * User, Workspace, WorkspaceMember, Suppression, ...) are intentionally
 * global/shared and are never scoped.
 */
const WORKSPACE_SCOPED_MODELS = new Set([
  "Search",
  "Lead",
  "ExclusionList",
  "ExclusionEntry",
  "EnrichmentJob",
  "DiscoveryRun",
  "Notification",
  "WebhookEndpoint",
  "WarmPath",
  "NetworkContact",
  "OutreachDraft",
  "UsageEvent",
]);

const FILTERED_BY_WHERE_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

export class WorkspaceScopeViolationError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Refusing ${operation} on ${model}: the payload's workspaceId does not match the scoped workspace. ` +
        `This is either an application bug (wrong workspace threaded through) or an attempted cross-tenant write.`
    );
    this.name = "WorkspaceScopeViolationError";
  }
}

/**
 * Returns a Prisma Client bound to a single workspace: every query against a
 * workspace-scoped model (see WORKSPACE_SCOPED_MODELS) is transparently
 * filtered or stamped with that workspaceId, so cross-tenant access isn't
 * something callers have to remember to prevent - it's structurally
 * unreachable through this client.
 *
 * Concretely:
 *  - Reads/updates/deletes: workspaceId is merged into `where` and always
 *    wins over anything the caller passed (even a wrong value is clamped to
 *    the authorized workspace, never trusted). A findUnique for an id that
 *    belongs to a different workspace returns null, not the record -
 *    Prisma supports non-unique filters alongside a unique `where` key
 *    ("filtered unique queries"), which is exactly what this relies on.
 *  - create/createMany/upsert: workspaceId is stamped onto the payload. If
 *    the caller already set a *different* workspaceId, that's treated as a
 *    bug and throws WorkspaceScopeViolationError rather than silently
 *    overwriting it (there's no "leak" to prevent by clamping on a row that
 *    doesn't exist yet - a mismatch there means something upstream threaded
 *    the wrong workspace through, and that should fail loudly).
 *
 * Known boundaries (not silently "solved", just not in scope here):
 *  - Nested relation writes (e.g. `prisma.search.create({ data: { leads: {
 *    create: [...] } } })`) are NOT walked into - only the top-level
 *    operation's `where`/`data` is scoped. The codebase doesn't currently
 *    do nested writes into workspace-scoped models, but if that changes,
 *    the nested payload needs its own explicit workspaceId.
 *  - $queryRaw / $executeRaw bypass Prisma's query builder entirely and so
 *    bypass this extension too - any raw SQL touching a scoped model must
 *    include its own workspaceId predicate by hand.
 */
export function getWorkspaceScopedPrisma(prisma: PrismaClient, workspaceId: string): PrismaClient {
  if (!workspaceId) {
    throw new Error("getWorkspaceScopedPrisma requires a non-empty workspaceId");
  }

  const extended = prisma.$extends({
    name: `workspace-scope:${workspaceId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !WORKSPACE_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          if (FILTERED_BY_WHERE_OPS.has(operation)) {
            a.where = { ...((a.where as Record<string, unknown>) ?? {}), workspaceId };
          }

          if (operation === "create" || operation === "upsert") {
            const dataKey = operation === "upsert" ? "create" : "data";
            const data = a[dataKey] as Record<string, unknown> | undefined;
            if (data) {
              if (data.workspaceId !== undefined && data.workspaceId !== workspaceId) {
                throw new WorkspaceScopeViolationError(model, operation);
              }
              data.workspaceId = workspaceId;
            }
          }

          if (operation === "upsert") {
            const updateData = a.update as Record<string, unknown> | undefined;
            if (updateData?.workspaceId !== undefined && updateData.workspaceId !== workspaceId) {
              throw new WorkspaceScopeViolationError(model, operation);
            }
            a.where = { ...((a.where as Record<string, unknown>) ?? {}), workspaceId };
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const items = a.data as Record<string, unknown>[] | undefined;
            if (Array.isArray(items)) {
              a.data = items.map((item) => {
                if (item.workspaceId !== undefined && item.workspaceId !== workspaceId) {
                  throw new WorkspaceScopeViolationError(model, operation);
                }
                return { ...item, workspaceId };
              });
            }
          }

          return query(a);
        },
      },
    },
  });

  // The extended client is structurally identical to PrismaClient (same
  // model delegates, same methods) - Prisma's own extension types just
  // don't nominally widen back to PrismaClient, so this cast is safe and
  // is the standard pattern for consuming extended clients through code
  // that's typed against the base client.
  return extended as unknown as PrismaClient;
}
