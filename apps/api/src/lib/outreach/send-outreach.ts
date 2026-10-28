import { boutiques, brandContacts, outreachEmails } from '@butika/db';
import { and, eq } from 'drizzle-orm';
import { env } from '../../env';
import { alanAdiCikar } from '../contact-discovery/discover-contacts';
import { gonderilebilirMi } from '../contact-discovery/store-contacts';
import { db } from '../db';
import { brevoHazirMi, brevoMailGonder } from './brevo';
import { KAMPANYA_KIMLIGI, tanitimMailiOlustur } from './template';

// Tanitim maili gonderimi.
//
// GUVENLIK: istemciden gelen hicbir bilgiye guvenilmez. Gonderimden hemen once
// alici veritabanindan tazeden okunur ve tum sartlar yeniden denetlenir.
// Ayrica (domain, campaign) benzersiz indeksi cift gonderimi veritabani
// seviyesinde engeller.

export type GonderimHatasi =
  | 'gonderim_kapali'
  | 'brevo_yok'
  | 'kayit_yok'
  | 'onayli_degil'
  | 'iletisim_istemiyor'
  | 'pazar_disi'
  | 'zaten_gonderildi'
  | 'brevo_hatasi';

export type GercekGonderimSonucu =
  | { ok: true; outreachId: string; messageId: string }
  | { ok: false; hata: GonderimHatasi; ayrinti?: string };

/**
 * TEK bir onaylanmis butige tanitim maili gonderir.
 *
 * @param domain marka alan adi (dogal anahtar)
 * @param govdeOverride sahibin onizlemede duzenledigi metin (yalniz bu gonderim)
 */
export async function butigeTanitimGonder(
  domain: string,
  govdeOverride?: string | null,
  konuOverride?: string | null,
): Promise<GercekGonderimSonucu> {
  // 1) Ana salter. Kapaliysa hicbir gercek gonderim yapilmaz.
  if (!env.OUTREACH_SENDING_ENABLED) return { ok: false, hata: 'gonderim_kapali' };
  if (!brevoHazirMi()) return { ok: false, hata: 'brevo_yok' };

  // 2) Alicinin durumunu TAZEDEN oku
  const [kayit] = await db
    .select()
    .from(brandContacts)
    .where(eq(brandContacts.domain, domain.toLowerCase()))
    .limit(1);
  if (!kayit) return { ok: false, hata: 'kayit_yok' };

  // 3) Sahibin kurali: yalniz 'onaylandi' + iletisim istiyor + gecerli adres
  if (!gonderilebilirMi(kayit)) {
    return { ok: false, hata: kayit.doNotContact ? 'iletisim_istemiyor' : 'onayli_degil' };
  }

  // 4) Marka Turkiye pazarinda aktif bir butige ait olmali
  const trButikler = await db
    .select({ url: boutiques.url, name: boutiques.name })
    .from(boutiques)
    .where(and(eq(boutiques.countryCode, 'TR'), eq(boutiques.isActive, true)));
  const butik = trButikler.find((b) => alanAdiCikar(b.url) === kayit.domain);
  if (!butik) return { ok: false, hata: 'pazar_disi' };

  const icerik = tanitimMailiOlustur(butik.name, govdeOverride, konuOverride);

  // 5) Once KAYDI olustur. Benzersiz indeks ayni markaya ikinci kaydi
  //    reddeder; boylece cift tiklama ya da es zamanli istek mail yollayamaz.
  let outreachId: string;
  try {
    const [satir] = await db
      .insert(outreachEmails)
      .values({
        brandContactId: kayit.id,
        domain: kayit.domain,
        recipientEmail: kayit.email as string,
        campaign: KAMPANYA_KIMLIGI,
        subject: icerik.subject,
        isTest: false,
        status: 'hazirlaniyor',
      })
      .returning({ id: outreachEmails.id });
    if (!satir) return { ok: false, hata: 'zaten_gonderildi' };
    outreachId = satir.id;
  } catch {
    // Benzersiz indeks ihlali = bu markaya bu kampanya zaten gonderilmis
    return { ok: false, hata: 'zaten_gonderildi' };
  }

  // 6) Gonder
  const sonuc = await brevoMailGonder(kayit.email as string, icerik, [KAMPANYA_KIMLIGI]);
  if (!sonuc.ok) {
    await db
      .update(outreachEmails)
      .set({ status: 'basarisiz', errorMessage: sonuc.hata })
      .where(eq(outreachEmails.id, outreachId));
    return { ok: false, hata: 'brevo_hatasi', ayrinti: sonuc.hata };
  }

  await db
    .update(outreachEmails)
    .set({ status: 'gonderildi', brevoMessageId: sonuc.messageId, sentAt: new Date() })
    .where(eq(outreachEmails.id, outreachId));

  return { ok: true, outreachId, messageId: sonuc.messageId };
}

export type TestGonderimSonucu =
  | { ok: true; outreachId: string; messageId: string }
  | { ok: false; hata: string };

/**
 * TEST gonderimi.
 *
 * Gercek butiklerden tamamen ayridir:
 * - brand_contact_id ve domain BOS kalir, hicbir butikle iliskilenmez
 * - is_test = true; benzersiz indekse takilmaz, cift gonderim sayilmaz
 * - hicbir butigin durumu, do_not_contact isareti ya da "mail gonderildi"
 *   bilgisi degismez
 * - ana salterden bagimsizdir; amaci zaten salter acilmadan once denemektir
 * - her cagride YALNIZ tek bir aliciya gider
 */
export async function testMailiGonder(
  alici: string,
  markaAdi: string,
  govdeOverride?: string | null,
  konuOverride?: string | null,
): Promise<TestGonderimSonucu> {
  if (!brevoHazirMi()) return { ok: false, hata: 'brevo_api_key_yok' };

  const icerik = tanitimMailiOlustur(markaAdi || 'Test Marka', govdeOverride, konuOverride);

  const [satir] = await db
    .insert(outreachEmails)
    .values({
      brandContactId: null,
      domain: null,
      recipientEmail: alici,
      campaign: KAMPANYA_KIMLIGI,
      subject: icerik.subject,
      isTest: true,
      status: 'hazirlaniyor',
    })
    .returning({ id: outreachEmails.id });
  if (!satir) return { ok: false, hata: 'kayit_olusmadi' };

  const sonuc = await brevoMailGonder(alici, icerik, [`${KAMPANYA_KIMLIGI}-test`]);
  if (!sonuc.ok) {
    await db
      .update(outreachEmails)
      .set({ status: 'basarisiz', errorMessage: sonuc.hata })
      .where(eq(outreachEmails.id, satir.id));
    return { ok: false, hata: sonuc.hata };
  }

  await db
    .update(outreachEmails)
    .set({ status: 'gonderildi', brevoMessageId: sonuc.messageId, sentAt: new Date() })
    .where(eq(outreachEmails.id, satir.id));

  return { ok: true, outreachId: satir.id, messageId: sonuc.messageId };
}
