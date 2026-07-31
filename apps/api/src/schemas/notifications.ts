import { z } from "zod";

export const notificationSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  userId: z.string().nullable(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

export const listNotificationsQuerySchema = z.object({
  workspaceId: z.string().min(1),
  unreadOnly: z.coerce.boolean().optional(),
});

export const streamNotificationsQuerySchema = z.object({
  workspaceId: z.string().min(1),
});

export const notificationIdParamsSchema = z.object({ id: z.string().min(1) });

export const markNotificationReadQuerySchema = z.object({
  workspaceId: z.string().min(1),
});
