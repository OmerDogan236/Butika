import { boutiques, brandContacts, outreachEmails } from '@butika/db';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../../env';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { alanAdiCikar } from '../../lib/contact-discovery/discover-contacts';
import { gonderilebilirMi } from '../../lib/contact-discovery/store-contacts';
import { db } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { brevoHazirMi } from '../../lib/outreach/brevo';
import { butigeTanitimGonder, testMailiGonder } from '../../lib/outreach/send-outreach';
import {
  GONDEREN_ADI,
  GONDEREN_EPOSTA,
  KAMPANYA_KIMLIGI,
  sablonGovdesi,
  tanitimMailiOlustur,
} from '../../lib/outreach/template';

export const adminOutreachRoutes = new Hono<AdminContext>();

adminOutreachRoutes.use('*', requireAdmin);

/** GET /admin/outreach/durum — sistem hazir mi? */
adminOutreachRoutes.get('/durum', async (c) => {
  return c.json({
    brevoHazir: brevoHazirMi(),
    gercekGonderimAcik: env.OUTREACH_SENDING_ENABLED,
    webhookHazir: Boolean(env.BREVO_WEBHOOK_TOKEN),
    gonderen: `${GONDEREN_ADI} <${GONDEREN_EPOSTA}>`,
    kampanya: KAMPANYA_KIMLIGI,
  });
});

/** GET /admin/outreach/preview?domain= — gonderilecek mailin son hali */
adminOutreachRoutes.get(
  '/preview',
  zValidator('query', z.object({ domain: z.string().min(3).optional() })),
  async (c) => {
    const domain = c.req.valid('query').domain?.toLowerCase();

    // Domain verilmediyse sablonun ham hali (test penceresi icin)
    if (!domain) {
      const icerik = tanitimMailiOlustur('Test Marka');
      return c.json({
        markaAdi: 'Test Marka',
        alici: null,
        from: `${GONDEREN_ADI} <${GONDEREN_EPOSTA}>`,
        replyTo: GONDEREN_EPOSTA,
        subject: icerik.subject,
        govde: sablonGovdesi(),
        html: icerik.html,
        gonderilebilir: false,
      });
    }

    const [kayit] = await db
      .select()
      .from(brandContacts)
      .where(eq(brandContacts.domain, domain))
      .limit(1);
    if (!kayit) throw ApiError.notFound('bu alan adi icin kayit yok');

    const trButikler = await db
      .select({ url: boutiques.url, name: boutiques.name })
      .from(boutiques)
      .where(and(eq(boutiques.countryCode, 'TR'), eq(boutiques.isActive, true)));
    const butik = trButikler.find((b) => alanAdiCikar(b.url) === kayit.domain);

    const markaAdi = butik?.name ?? kayit.domain;
    const icerik = tanitimMailiOlustur(markaAdi);

    const [oncekiGonderim] = await db
      .select({
        id: outreachEmails.id,
        status: outreachEmails.status,
        sentAt: outreachEmails.sentAt,
      })
      .from(outreachEmails)
      .where(and(eq(outreachEmails.domain, kayit.domain), eq(outreachEmails.isTest, false)))
      .limit(1);

    return c.json({
      markaAdi,
      alici: kayit.email,
      from: `${GONDEREN_ADI} <${GONDEREN_EPOSTA}>`,
      replyTo: GONDEREN_EPOSTA,
      subject: icerik.subject,
      govde: sablonGovdesi(),
      html: icerik.html,
      gonderilebilir: gonderilebilirMi(kayit) && Boolean(butik) && !oncekiGonderim,
      zatenGonderildi: Boolean(oncekiGonderim),
      oncekiGonderim: oncekiGonderim ?? null,
    });
  },
);

/**
 * POST /admin/outreach/test — TEST maili.
 * Gercek butiklerden tamamen ayridir; tek bir aliciya gider.
 */
adminOutreachRoutes.post(
  '/test',
  zValidator(
    'json',
    z.object({
      email: z.string().email(),
      markaAdi: z.string().max(120).optional(),
      govde: z.string().max(20_000).optional(),
      subject: z.string().max(300).optional(),
    }),
  ),
  async (c) => {
    const { email, markaAdi, govde, subject } = c.req.valid('json');
    const sonuc = await testMailiGonder(email, markaAdi ?? 'Test Marka', govde, subject);
    if (!sonuc.ok) throw ApiError.badRequest('test_gonderilemedi', sonuc.hata);
    return c.json({ ok: true, outreachId: sonuc.outreachId, messageId: sonuc.messageId });
  },
);

/** POST /admin/outreach/send — TEK butige gercek gonderim. */
adminOutreachRoutes.post(
  '/send',
  zValidator(
    'json',
    z.object({
      domain: z.string().min(3),
      govde: z.string().max(20_000).optional(),
      subject: z.string().max(300).optional(),
    }),
  ),
  async (c) => {
    const { domain, govde, subject } = c.req.valid('json');
    const sonuc = await butigeTanitimGonder(domain, govde, subject);
    if (!sonuc.ok) {
      const mesajlar: Record<string, string> = {
        gonderim_kapali: 'Gerçek gönderim kapalı (OUTREACH_SENDING_ENABLED).',
        brevo_yok: 'Brevo API anahtarı tanımlı değil.',
        kayit_yok: 'Bu alan adı için kayıt yok.',
        onayli_degil: 'Adres onaylı değil; yalnız onaylanmış adreslere gönderilir.',
        iletisim_istemiyor: 'Marka iletişim istemiyor.',
        pazar_disi: 'Marka Türkiye pazarında aktif değil.',
        zaten_gonderildi: 'Bu markaya bu kampanya zaten gönderilmiş.',
        brevo_hatasi: `Brevo hatası: ${sonuc.ayrinti ?? ''}`,
      };
      throw ApiError.badRequest(sonuc.hata, mesajlar[sonuc.hata] ?? sonuc.hata);
    }
    return c.json({ ok: true, outreachId: sonuc.outreachId });
  },
);

/** GET /admin/outreach/gonderimler — kayitlar (test olanlar ayri isaretli) */
adminOutreachRoutes.get('/gonderimler', async (c) => {
  const satirlar = await db
    .select()
    .from(outreachEmails)
    .orderBy(desc(outreachEmails.createdAt))
    .limit(200);
  return c.json({ gonderimler: satirlar });
});
