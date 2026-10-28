import { outreachEmailEvents, outreachEmails } from '@butika/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { env } from '../env';
import { db } from '../lib/db';
import { logger } from '../lib/logger';
import { durumIlerletilmeli, olayEslesmesi, olayZamani } from '../lib/outreach/webhook-events';

// Brevo transactional webhook alicisi.
//
// GUVENLIK: Brevo'nun "secured webhooks" ozelligiyle webhook'a bearer token
// tanimlaniyor. Token tutmayan istek 401 alir; boylece sahte bir istek mail
// durumlarini degistiremez.
//
// IDEMPOTENT: her olay (kayit + olay adi + zaman) benzersiz indeksiyle bir kez
// islenir; ayni olay tekrar gelirse veri bozulmaz. Durum yalniz ILERI gider.

export const brevoWebhookRoutes = new Hono();

type BrevoOlay = {
  event?: string;
  'message-id'?: string;
  messageId?: string;
  email?: string;
  ts?: number;
  ts_event?: number;
  date?: string;
};

brevoWebhookRoutes.post('/', async (c) => {
  // 1) Token dogrulamasi
  const beklenen = env.BREVO_WEBHOOK_TOKEN;
  if (!beklenen) return c.json({ error: 'webhook_kapali' }, 503);
  const gelen = c.req
    .header('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  if (gelen !== beklenen) return c.json({ error: 'yetkisiz' }, 401);

  const govde = (await c.req.json().catch(() => null)) as BrevoOlay | BrevoOlay[] | null;
  if (!govde) return c.json({ error: 'gecersiz_govde' }, 400);
  const olaylar = Array.isArray(govde) ? govde : [govde];

  let islenen = 0;
  for (const olay of olaylar) {
    const messageId = olay['message-id'] ?? olay.messageId;
    const eslesme = olay.event ? olayEslesmesi(olay.event) : null;
    if (!messageId || !eslesme) continue;

    const [kayit] = await db
      .select({ id: outreachEmails.id, status: outreachEmails.status })
      .from(outreachEmails)
      .where(eq(outreachEmails.brevoMessageId, messageId))
      .limit(1);
    if (!kayit) continue; // bizim gondermedigimiz bir mail — sessizce gec

    const zaman = olayZamani(olay);

    // Olayi kaydet; ayni olay ikinci kez gelirse indeks reddeder.
    await db
      .insert(outreachEmailEvents)
      .values({
        outreachEmailId: kayit.id,
        event: olay.event as string,
        eventAt: zaman,
        payload: JSON.stringify(olay).slice(0, 2000),
      })
      .onConflictDoNothing();

    const guncel: Record<string, unknown> = { lastEventAt: zaman };
    if (eslesme.alan) guncel[eslesme.alan] = zaman;
    if (durumIlerletilmeli(kayit.status, eslesme.durum)) guncel.status = eslesme.durum;

    await db.update(outreachEmails).set(guncel).where(eq(outreachEmails.id, kayit.id));
    islenen += 1;
  }

  logger.info({ toplam: olaylar.length, islenen }, 'brevo webhook');
  // Brevo 2xx bekliyor; aksi halde tekrar tekrar dener.
  return c.json({ ok: true, islenen });
});
