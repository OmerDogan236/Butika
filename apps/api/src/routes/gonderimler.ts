import { boutiques, butikBaglantilari, gonderimler } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { type AuthContext, requireAuth } from '../lib/auth';
import { etiketliUrl, yeniGonderimId } from '../lib/baglanti/kurallar';
import { pilotKullanicisiMi } from '../lib/baglanti/pilot';
import { db } from '../lib/db';

export const gonderimlerRoutes = new Hono<AuthContext>();

gonderimlerRoutes.use('*', requireAuth);

const govdeSema = z.object({ boutiqueId: z.string().uuid(), url: z.string().url() });

function alanAdi(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Butikte gör: bağlı butik + pilot kullanıcı ise etiketli link ve bir gönderim satırı;
// aksi halde link aynen döner.
gonderimlerRoutes.post('/', zValidator('json', govdeSema), async (c) => {
  const userId = c.get('userId');
  const { boutiqueId, url } = c.req.valid('json');

  if (!pilotKullanicisiMi(userId)) return c.json({ url });

  const [butik] = await db
    .select({ url: boutiques.url })
    .from(boutiques)
    .innerJoin(
      butikBaglantilari,
      and(eq(butikBaglantilari.boutiqueId, boutiques.id), eq(butikBaglantilari.durum, 'aktif')),
    )
    .where(eq(boutiques.id, boutiqueId))
    .limit(1);
  if (!butik) return c.json({ url });

  const istenen = alanAdi(url);
  if (!istenen || istenen !== alanAdi(butik.url)) return c.json({ url });

  const id = yeniGonderimId();
  await db.insert(gonderimler).values({ id, userId, boutiqueId, url });
  return c.json({ url: etiketliUrl(url, id) });
});
