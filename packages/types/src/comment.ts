import { z } from 'zod';

export const commentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  boutiqueId: z.string().uuid(),
  url: z.string().url(),
  body: z.string().min(1).max(1000),
  createdAt: z.string().datetime(),
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    gender: z.enum(['female', 'male']).nullable(),
    heightCm: z.number().int().nullable(),
    weightKg: z.number().int().nullable(),
  }),
});

export type Comment = z.infer<typeof commentSchema>;

export const commentCreateSchema = z.object({
  boutiqueId: z.string().uuid(),
  url: z.string().url().max(2048),
  body: z.string().min(1).max(1000),
});

export type CommentCreate = z.infer<typeof commentCreateSchema>;

// Yorum şikayet sebepleri (App Store 1.2 moderasyonu).
export const commentReportReasonSchema = z.enum([
  'spam',
  'harassment', // hakaret / taciz
  'inappropriate', // uygunsuz içerik
  'other',
]);
export type CommentReportReason = z.infer<typeof commentReportReasonSchema>;

export const commentReportCreateSchema = z.object({
  reason: commentReportReasonSchema,
});
export type CommentReportCreate = z.infer<typeof commentReportCreateSchema>;
