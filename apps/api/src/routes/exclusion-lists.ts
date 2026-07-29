import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { parseExclusionCsv } from "../services/csv-import.js";
import { assertWorkspaceMember } from "../lib/authz.js";

const createListBodySchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
});

const listQuerySchema = z.object({ workspaceId: z.string().min(1) });

const exclusionListSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaceId: z.string(),
  createdAt: z.date(),
  entryCount: z.number(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const uploadResponseSchema = z.object({
  detectedFormat: z.enum(["linkedin_import", "csv"]),
  rowsParsed: z.number(),
  entriesCreated: z.number(),
});

const exclusionListRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.post(
    "/",
    {
      schema: {
        summary: "Create an exclusion list for a workspace",
        body: createListBodySchema,
        response: { 201: exclusionListSchema },
      },
    },
    async (request, reply) => {
      await assertWorkspaceMember(fastify, request, request.body.workspaceId);
      const list = await fastify.prisma.exclusionList.create({
        data: { workspaceId: request.body.workspaceId, name: request.body.name },
      });
      reply.code(201);
      return { id: list.id, name: list.name, workspaceId: list.workspaceId, createdAt: list.createdAt, entryCount: 0 };
    }
  );

  fastify.get(
    "/",
    {
      schema: {
        summary: "List a workspace's exclusion lists",
        querystring: listQuerySchema,
        response: { 200: z.array(exclusionListSchema) },
      },
    },
    async (request) => {
      await assertWorkspaceMember(fastify, request, request.query.workspaceId);
      const lists = await fastify.prisma.exclusionList.findMany({
        where: { workspaceId: request.query.workspaceId },
        include: { _count: { select: { entries: true } } },
        orderBy: { createdAt: "desc" },
      });
      return lists.map((l) => ({
        id: l.id,
        name: l.name,
        workspaceId: l.workspaceId,
        createdAt: l.createdAt,
        entryCount: l._count.entries,
      }));
    }
  );

  fastify.post(
    "/:id/upload",
    {
      schema: {
        summary:
          "Upload a CSV of people/firms to exclude. Auto-detects LinkedIn's Connections.csv export format vs a generic CSV.",
        params: idParamsSchema,
        response: { 200: uploadResponseSchema },
      },
    },
    async (request, reply) => {
      const list = await fastify.prisma.exclusionList.findUnique({ where: { id: request.params.id } });
      if (!list) return reply.notFound();
      await assertWorkspaceMember(fastify, request, list.workspaceId);

      const file = await request.file();
      if (!file) return reply.badRequest("Expected a multipart file upload");

      const raw = (await file.toBuffer()).toString("utf-8");
      const { rows, detectedFormat } = parseExclusionCsv(raw);

      if (rows.length > 0) {
        await fastify.prisma.exclusionEntry.createMany({
          data: rows.map((r) => ({
            exclusionListId: list.id,
            name: r.name,
            email: r.email,
            linkedinUrl: r.linkedinUrl,
            source: detectedFormat === "linkedin_import" ? ("LINKEDIN_IMPORT" as const) : ("CSV" as const),
          })),
        });
      }

      return { detectedFormat, rowsParsed: rows.length, entriesCreated: rows.length };
    }
  );

  fastify.delete(
    "/:id",
    {
      schema: {
        summary: "Delete an exclusion list",
        params: idParamsSchema,
      },
    },
    async (request, reply) => {
      const existing = await fastify.prisma.exclusionList.findUnique({ where: { id: request.params.id } });
      if (!existing) return reply.notFound();
      await assertWorkspaceMember(fastify, request, existing.workspaceId);
      await fastify.prisma.exclusionList.delete({ where: { id: request.params.id } });
      return reply.code(204).send();
    }
  );
};

export default exclusionListRoutes;
