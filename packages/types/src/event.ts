import { z } from 'zod';

export const eventTypeSchema = z.enum([
  'app_open',
  'boutique_view',
  'webview_open',
  'product_saved',
  'product_unsaved',
  'product_open',
  'search',
  'share',
  'tarz_testi_basladi',
  'tarz_testi_adim',
  'oneri_tiklandi',
  'detayli_davet',
]);

export type EventType = z.infer<typeof eventTypeSchema>;

export const eventSchema = z.object({
  type: eventTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
});

export type EventInput = z.infer<typeof eventSchema>;

export const eventBatchSchema = z.array(eventSchema).min(1).max(100);
