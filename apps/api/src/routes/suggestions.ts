import { boutiqueSuggestions, boutiques } from '@butika/db';
import { suggestionCreateSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { resolveMarket } from '../lib/market';

export const suggestionRoutes = new Hono<AuthContext>();

suggestionRoutes.use('*', requireAuth);

suggestionRoutes.post('/', zValidator('json', suggestionCreateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');
  const market = await resolveMarket(c, c.req.query('country'));

  const [existingBoutique] = await db
    .select({ id: boutiques.id })
    .from(boutiques)
    .where(and(eq(boutiques.countryCode, market), eq(boutiques.url, body.url)))
    .limit(1);
  if (existingBoutique) {
    throw ApiError.conflict('boutique_exists', "bu butik zaten Butika'da");
  }

  const [existingPending] = await db
    .select({ id: boutiqueSuggestions.id })
    .from(boutiqueSuggestions)
    .where(and(eq(boutiqueSuggestions.url, body.url), eq(boutiqueSuggestions.status, 'pending')))
    .limit(1);
  if (existingPending) {
    throw ApiError.conflict('suggestion_pending', 'bu butik için zaten bekleyen bir öneri var');
  }

  const [created] = await db
    .insert(boutiqueSuggestions)
    .values({
      userId,
      name: body.name.trim(),
      url: body.url,
      note: body.note?.trim() || null,
      countryCode: market,
    })
    .returning({
      id: boutiqueSuggestions.id,
      status: boutiqueSuggestions.status,
      createdAt: boutiqueSuggestions.createdAt,
    });
  if (!created) throw ApiError.internal('create failed');

  return c.json(
    {
      id: created.id,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
    },
    201,
  );
});
