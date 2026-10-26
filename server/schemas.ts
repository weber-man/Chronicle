import { z } from 'zod';

export const emailSchema = z.string().trim().max(254, 'Email is too long.').email('Email is invalid.');

export const timelineDateSchema = z.object({
  precision: z.enum(['year', 'month', 'day']),
  year: z.number().int().min(0).max(9999),
  month: z.number().int().min(1).max(12).nullable().optional(),
  day: z.number().int().min(1).max(31).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.precision !== 'year' && !value.month) {
    ctx.addIssue({ code: 'custom', path: ['month'], message: 'Month is missing.' });
  }
  if (value.precision === 'day' && !value.day) {
    ctx.addIssue({ code: 'custom', path: ['day'], message: 'Day is missing.' });
  }
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is missing.').max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(200).default('Alltag'),
  startDate: timelineDateSchema,
  endDate: timelineDateSchema.nullable(),
  isOngoing: z.boolean().default(false),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const aiEventDraftSchema = z.object({
  title: z.string().trim().min(1, 'Titel fehlt.').max(120),
  description: z.string().trim().max(1000).default(''),
  category: z.string().trim().min(1).max(200).default('Alltag'),
  startDate: timelineDateSchema,
  endDate: timelineDateSchema.nullable().optional().default(null),
  isOngoing: z.boolean().optional().default(false),
});

export type AiDraft = z.infer<typeof aiEventDraftSchema>;

export const aiSettingsSchema = z.object({
  apiKey: z.string().trim().min(20, 'API-Key ist zu kurz.').max(300).optional(),
  model: z.string().trim().min(1, 'Modell fehlt.').max(160).optional(),
});

export const aiGenerateSchema = z.object({
  prompt: z.string().trim().min(3, 'Beschreibung fehlt.').max(4000),
});

export const aiReviseSchema = z.object({
  draft: eventInputSchema,
  instruction: z.string().trim().min(2, 'Änderungswunsch fehlt.').max(1000),
});

export const eventSortSchema = z.enum([
  'start-asc',
  'start-desc',
  'duration-desc',
  'title-asc',
  'updated-desc',
  'deleted-desc',
]);

export const eventQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  type: z.enum(['all', 'points', 'ranges', 'ongoing']).default('all'),
  sort: eventSortSchema.default('start-asc'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  trash: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

export type EventQuery = z.infer<typeof eventQuerySchema>;

const importEventSchema = eventInputSchema.extend({
  deletedAt: z.string().max(40).nullable().optional(),
  createdAt: z.string().max(40).optional(),
  sourceId: z.number().int().positive().optional(),
});

export const importPayloadSchema = z.union([
  z.object({
    format: z.string().max(60).optional(),
    version: z.number().int().min(1).max(100).optional(),
    events: z.array(importEventSchema).min(1, 'The file contains no events.').max(5000),
  }),
  z.array(importEventSchema).min(1, 'The file contains no events.').max(5000),
]).transform((payload) => ({
  events: Array.isArray(payload) ? payload : payload.events,
}));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  email: emailSchema,
  password: z.string().min(12).max(200),
});

export const createUserSchema = registerSchema.extend({
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  currentPassword: z.string().min(8).max(200).optional(),
  newPassword: z.string().min(12).max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.newPassword && !value.currentPassword) {
    ctx.addIssue({ code: 'custom', path: ['currentPassword'], message: 'Current password is missing.' });
  }
});

export const deleteAccountSchema = z.object({
  password: z.string().min(8).max(200),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  role: z.enum(['admin', 'user']).optional(),
  password: z.string().min(12).max(200).optional(),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: z.string().min(12).max(200),
});
