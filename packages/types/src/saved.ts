import { z } from 'zod';

export const savedTrackingSchema = z.object({
  status:z.enum(['pending','active','out_of_stock','unverified','retrying','paused','unsupported']),
  priceMinor:z.number().int().positive().nullable(),
  currency:z.string().nullable(),
  checkedAt:z.string().datetime().nullable(),
});
export type SavedTracking = z.infer<typeof savedTrackingSchema>;

// "Stok gelince haber ver": pending until the server itself sees the size sold out.
export const restockAlertSchema = z.enum(['off', 'pending', 'armed']);
export type RestockAlert = z.infer<typeof restockAlertSchema>;

export const savedProductSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  boutiqueId: z.string().uuid(),
  url: z.string().url(),
  title: z.string().min(1).max(500),
  imageUrl: z.string().url().nullable(),
  description: z.string().max(2000).nullable(),
  createdAt: z.string().datetime(),
  // Satın alım takibi
  purchasedAt: z.string().datetime().nullable(),
  orderNumber: z.string().nullable(),
  carrier: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  deliveredAt: z.string().datetime().nullable(),
});

export type SavedProduct = z.infer<typeof savedProductSchema>;
export const savedVariantUpdateSchema = z.object({url:z.string().url(),title:z.string().min(1).max(500)});

// PATCH /saved/:id/purchase — satın al / güncelle / teslim / geri al.
export const purchaseUpdateSchema = z.object({
  purchased: z.boolean().optional(),
  orderNumber: z.string().max(120).nullable().optional(),
  carrier: z.string().max(80).nullable().optional(),
  trackingNumber: z.string().max(120).nullable().optional(),
  delivered: z.boolean().optional(),
});

export type PurchaseUpdate = z.infer<typeof purchaseUpdateSchema>;

export const savedProductCreateSchema = z
  .object({
    boutiqueId: z.string().uuid(),
    url: z.string().url(),
    title: z.string().min(1).max(500),
    imageUrl: z.string().url().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    priceMinor: z.number().int().nonnegative().nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasPrice = data.priceMinor != null;
    const hasCurrency = data.currency != null;

    if (hasPrice !== hasCurrency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'priceMinor and currency must be provided together',
        path: hasPrice ? ['currency'] : ['priceMinor'],
      });
    }
  });
