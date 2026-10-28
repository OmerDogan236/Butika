import { boutiqueApplications } from '@butika/db';
import { boutiqueApplicationCreateSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';

// Public (giriş gerektirmez) — landing page butik başvuru formu buraya POST eder.
export const boutiqueApplyRoutes = new Hono();

boutiqueApplyRoutes.post('/', zValidator('json', boutiqueApplicationCreateSchema), async (c) => {
  const body = c.req.valid('json');

  const [created] = await db
    .insert(boutiqueApplications)
    .values({
      boutiqueName: body.boutiqueName.trim(),
      city: body.city.trim(),
      contactName: body.contactName.trim(),
      phone: body.phone.trim(),
      email: body.email.trim().toLowerCase(),
      website: body.website?.trim() || null,
      description: body.description?.trim() || null,
    })
    .returning({ id: boutiqueApplications.id, createdAt: boutiqueApplications.createdAt });

  if (!created) throw ApiError.internal('başvuru kaydedilemedi');

  return c.json({ id: created.id, createdAt: created.createdAt.toISOString() }, 201);
});
