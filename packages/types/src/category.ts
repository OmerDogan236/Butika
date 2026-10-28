import { z } from 'zod';
import { countryCodeSchema } from './country';

export const categorySchema = z.object({
  id: z.string().uuid(),
  countryCode: countryCodeSchema,
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type Category = z.infer<typeof categorySchema>;

export const categoryCreateSchema = categorySchema.omit({ id: true }).partial({
  sortOrder: true,
  isActive: true,
});
export const categoryUpdateSchema = categoryCreateSchema.partial();
