import { z } from 'zod';

export const suggestionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  url: z.string().url(),
  note: z.string().nullable(),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  boutiqueId: z.string().uuid().nullable(),
});

export type Suggestion = z.infer<typeof suggestionSchema>;

export const suggestionCreateSchema = z.object({
  name: z.string().min(2).max(80),
  url: z.string().url().max(2048),
  note: z.string().max(500).optional(),
});

export type SuggestionCreate = z.infer<typeof suggestionCreateSchema>;
