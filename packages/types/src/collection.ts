import { z } from 'zod';

export const collectionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Collection = z.infer<typeof collectionSchema>;

export const collectionWithMetaSchema = collectionSchema.extend({
  coverUrls: z.array(z.string().url()).max(4),
  productCount: z.number().int().min(0),
});

export type CollectionWithMeta = z.infer<typeof collectionWithMetaSchema>;

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
});

export type CollectionCreate = z.infer<typeof collectionCreateSchema>;

export const collectionUpdateSchema = collectionCreateSchema.partial();

export type CollectionUpdate = z.infer<typeof collectionUpdateSchema>;

export const collectionBatchCreateSchema = z.object({
  names: z.array(z.string().trim().min(2).max(60)).min(1).max(10),
});

export type CollectionBatchCreate = z.infer<typeof collectionBatchCreateSchema>;

export const addToCollectionsSchema = z.object({
  collectionIds: z.array(z.string().uuid()).min(1).max(50),
});

export type AddToCollections = z.infer<typeof addToCollectionsSchema>;
