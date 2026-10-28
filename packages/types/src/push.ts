import { z } from 'zod';

export const pushDeviceUpsertSchema = z.object({
  installationId: z.string().uuid(),
  expoPushToken: z
    .string()
    .min(10)
    .max(256)
    .regex(/^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/),
  platform: z.enum(['android', 'ios']),
});

export type PushDeviceUpsertInput = z.infer<typeof pushDeviceUpsertSchema>;