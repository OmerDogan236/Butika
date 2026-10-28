import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { presignUpload } from '../../lib/s3';

export const adminUploadRoutes = new Hono<AdminContext>();

adminUploadRoutes.use('*', requireAdmin);

const presignSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp|avif)$/, 'sadece image/jpeg|png|webp|avif kabul edilir'),
  prefix: z.enum(['boutiques', 'logos']).default('boutiques'),
});

adminUploadRoutes.post('/', zValidator('json', presignSchema), async (c) => {
  const { filename, contentType, prefix } = c.req.valid('json');
  const result = await presignUpload(prefix, filename, contentType);
  return c.json(result);
});
