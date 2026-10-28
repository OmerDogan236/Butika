import { butikBaglantilari, butikSiparisleri, gonderimler } from '@butika/db';
import { and, eq } from 'drizzle-orm';
import { env } from '../../env';
import { db } from '../db';
import { logger } from '../logger';
import { baglantiIstemcisi, baglantiKaynagi, baglantiyiKopar, yetkiHatasiMi } from './baglanti-istemcisi';
import type { NormalSiparis } from './ikas/ikas-siparis';
import { durumuCevir, iadeVeyaKismiMi, komisyonKarari, siparisAtfi, tamIptalMi } from './kurallar';

export type IslemeSonucu = 'yeni' | 'guncellendi' | 'atlandi';

export const SIPARIS_BILDIRIM_KAPSAMLARI = ['store/order/created', 'store/order/updated'];
const GUN_MS = 24 * 3600_000;

const hataOzeti = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/**
 * Bağlı mağazadan gelen siparişi kaydeder. Butika'dan gelmeyen ve kaydı olmayan sipariş hiç
 * yazılmaz; bağlantı aktif değilse hiçbir şey yazılmaz. Daha eski ikas anlık görüntüsü
 * (updatedAt) yok sayılır. Satır (baglantiId, disSiparisId) başına tektir; eşzamanlı işlemede de tek kalır.
 * Mevcut kayıtta atıf (gonderimId/userId) değişmez; komisyon kuralı: `komisyonKarari`.
 * Son (yeniden) bağlanmadan önce verilmiş siparişe komisyon yazılmaz (butik o sırada bağlı değildi).
 * Müşteri bilgisi (ad, e-posta, telefon, adres, IP) NormalSiparis'te yoktur, burada da yazılmaz.
 */
export async function siparisiIsle(
  baglantiId: string,
  s: NormalSiparis,
  simdi: Date = new Date(),
): Promise<IslemeSonucu> {
  const [baglanti] = await db
    .select({
      boutiqueId: butikBaglantilari.boutiqueId,
      durum: butikBaglantilari.durum,
      baglandiAt: butikBaglantilari.baglandiAt,
      onayAt: butikBaglantilari.onayAt,
    })
    .from(butikBaglantilari)
    .where(eq(butikBaglantilari.id, baglantiId));
  // Kapanan/kopan bağlantıya (ör. kaldırma sırasında süren tarama) yazılmaz.
  if (!baglanti || baglanti.durum !== 'aktif') return 'atlandi';
  const baglantidanOnce =
    s.siparisAt.getTime() < (baglanti.baglandiAt ?? baglanti.onayAt).getTime();

  const { durum, odendi } = durumuCevir(s.hamDurum);
  const tamIptal = tamIptalMi(s.hamDurum);
  const iadeVeyaKismi = iadeVeyaKismiMi(s.hamDurum);
  const ortak = {
    siparisNo: s.siparisNo,
    siparisAt: s.siparisAt,
    durum,
    odendi,
    tutarMinor: s.tutarMinor,
    currency: s.currency,
    satirlar: s.satirlar,
    kargoFirmasi: s.kargoFirmasi,
    takipNo: s.takipNo,
    takipUrl: s.takipUrl,
  };

  return db.transaction(async (tx) => {
    const mevcutOku = async () =>
      (
        await tx
          .select({
            id: butikSiparisleri.id,
            gonderimId: butikSiparisleri.gonderimId,
            komisyonMinor: butikSiparisleri.komisyonMinor,
            komisyonAt: butikSiparisleri.komisyonAt,
            iptalGorulduAt: butikSiparisleri.iptalGorulduAt,
            disGuncellemeAt: butikSiparisleri.disGuncellemeAt,
          })
          .from(butikSiparisleri)
          .where(
            and(
              eq(butikSiparisleri.baglantiId, baglantiId),
              eq(butikSiparisleri.disSiparisId, s.disSiparisId),
            ),
          )
          .for('update')
      )[0];

    let mevcut = await mevcutOku();
    if (!mevcut) {
      if (s.utmSource !== 'butika') return 'atlandi';
      const gonderim = s.utmContent
        ? ((
            await tx
              .select({
                id: gonderimler.id,
                boutiqueId: gonderimler.boutiqueId,
                userId: gonderimler.userId,
              })
              .from(gonderimler)
              .where(eq(gonderimler.id, s.utmContent))
          )[0] ?? null)
        : null;
      const atif = siparisAtfi(s, gonderim, baglanti.boutiqueId);
      const komisyon = komisyonKarari(
        { komisyonMinor: null, komisyonAt: null, iptalGorulduAt: null },
        {
          odendi,
          gonderimId: baglantidanOnce ? null : atif.gonderimId,
          tamIptal,
          iadeVeyaKismi,
          tutarMinor: s.tutarMinor,
        },
        simdi,
      );
      const [eklenen] = await tx
        .insert(butikSiparisleri)
        .values({
          baglantiId,
          boutiqueId: baglanti.boutiqueId,
          disSiparisId: s.disSiparisId,
          ...ortak,
          disGuncellemeAt: s.guncellemeAt,
          ...atif,
          ...komisyon,
        })
        .onConflictDoNothing({
          target: [butikSiparisleri.baglantiId, butikSiparisleri.disSiparisId],
        })
        .returning({ id: butikSiparisleri.id });
      if (eklenen) return 'yeni';
      // Aynı sipariş eşzamanlı başka yerde (webhook/tarama) eklendi: onu güncelle.
      mevcut = await mevcutOku();
      if (!mevcut) throw new Error('siparis_kaydi_okunamadi');
    }

    // ikas'ta daha yeni hali zaten işlendi (ör. tarama sayfası webhook'tan önce okundu).
    if (
      mevcut.disGuncellemeAt &&
      s.guncellemeAt &&
      s.guncellemeAt.getTime() < mevcut.disGuncellemeAt.getTime()
    )
      return 'atlandi';
    const komisyon = komisyonKarari(
      mevcut,
      {
        odendi,
        gonderimId: baglantidanOnce ? null : mevcut.gonderimId,
        tamIptal,
        iadeVeyaKismi,
        tutarMinor: s.tutarMinor,
      },
      simdi,
    );
    if (mevcut.iptalGorulduAt && mevcut.komisyonMinor === null && komisyon.komisyonMinor !== null)
      logger.warn(
        { baglantiId, disSiparisId: s.disSiparisId },
        'baglanti: iptal edilen siparis yeniden acildi',
      );
    await tx
      .update(butikSiparisleri)
      .set({
        ...ortak,
        // updatedAt'i gelmeyen anlık görüntü saklı değeri silmez.
        ...(s.guncellemeAt ? { disGuncellemeAt: s.guncellemeAt } : {}),
        ...komisyon,
        updatedAt: new Date(),
      })
      .where(eq(butikSiparisleri.id, mevcut.id));
    return 'guncellendi';
  });
}

async function baglantiOku(baglantiId: string) {
  const [b] = await db
    .select({
      id: butikBaglantilari.id,
      platform: butikBaglantilari.platform,
      magazaAdi: butikBaglantilari.magazaAdi,
      kimlikSifreli: butikBaglantilari.kimlikSifreli,
      durum: butikBaglantilari.durum,
      sonSiparisTaramaAt: butikBaglantilari.sonSiparisTaramaAt,
      baglandiAt: butikBaglantilari.baglandiAt,
      onayAt: butikBaglantilari.onayAt,
    })
    .from(butikBaglantilari)
    .where(eq(butikBaglantilari.id, baglantiId));
  return b ?? null;
}

/**
 * Sipariş bildirimi: yalnız sipariş kimliği bildirimden gelir, sipariş ikas'tan yeniden okunur.
 * Bağlantı aktif değilse hiçbir şey yapılmaz. Yetki reddi bağlantıyı 'koptu' yapar.
 * Diğer hatalar fırlatılır (çağıran 500 döner, ikas yeniden dener).
 */
export async function siparisBildiriminiIsle(
  baglantiId: string,
  disSiparisId: string,
  fetchFn: typeof fetch = fetch,
): Promise<IslemeSonucu> {
  const b = await baglantiOku(baglantiId);
  if (!b || b.durum !== 'aktif') return 'atlandi';
  const ist = await baglantiKaynagi(b, fetchFn);
  if (!ist) throw new Error('kimlik_okunamadi');
  let s: NormalSiparis | null;
  try {
    s = await ist.siparis(disSiparisId);
  } catch (e) {
    if (yetkiHatasiMi(e)) {
      await baglantiyiKopar(baglantiId);
      logger.warn({ baglantiId }, 'siparis: ikas yetkisi reddedildi, bağlantı koptu');
      return 'atlandi';
    }
    throw e;
  }
  if (!s) return 'atlandi';
  return siparisiIsle(baglantiId, s);
}

export type TaramaSonucu = 'tamam' | 'gecici' | 'koptu' | 'atlandi';

/**
 * Bir bağlantının siparişlerini tarar: `sonSiparisTaramaAt − 1 gün`'den (ilkinde bağlanma
 * anından; hiçbir zaman bağlanmadan öncesinden değil) beri güncellenenler. Fırlatmaz.
 * Geçici hatada sonSiparisTaramaAt değişmez.
 */
export async function baglantiSiparisleriniTara(
  baglantiId: string,
  deps: { fetchFn?: typeof fetch; simdi?: Date } = {},
): Promise<TaramaSonucu> {
  const simdi = deps.simdi ?? new Date();
  try {
    const b = await baglantiOku(baglantiId);
    if (!b || b.durum !== 'aktif') return 'atlandi';
    const ist = await baglantiKaynagi(b, deps.fetchFn ?? fetch);
    if (!ist) {
      logger.warn({ baglantiId }, 'siparis-tarama: kimlik okunamadı');
      return 'gecici';
    }
    const baslangic = (b.baglandiAt ?? b.onayAt).getTime();
    const sonra = new Date(
      b.sonSiparisTaramaAt
        ? Math.max(b.sonSiparisTaramaAt.getTime() - GUN_MS, baslangic)
        : baslangic,
    );
    let yeni = 0;
    let guncellenen = 0;
    try {
      for await (const s of ist.siparisler(sonra, simdi)) {
        const sonuc = await siparisiIsle(baglantiId, s, simdi);
        if (sonuc === 'yeni') yeni++;
        else if (sonuc === 'guncellendi') guncellenen++;
      }
    } catch (e) {
      if (yetkiHatasiMi(e)) {
        await baglantiyiKopar(baglantiId);
        logger.warn({ baglantiId }, 'siparis-tarama: ikas yetkisi reddedildi, bağlantı koptu');
        return 'koptu';
      }
      logger.warn({ baglantiId, hata: hataOzeti(e) }, 'siparis-tarama: geçici hata');
      return 'gecici';
    }
    await db
      .update(butikBaglantilari)
      .set({ sonSiparisTaramaAt: simdi, updatedAt: new Date() })
      .where(and(eq(butikBaglantilari.id, baglantiId), eq(butikBaglantilari.durum, 'aktif')));
    logger.info({ baglantiId, yeni, guncellenen }, 'siparis-tarama: bağlantı tarandı');
    return 'tamam';
  } catch (e) {
    logger.error({ baglantiId, hata: hataOzeti(e) }, 'siparis-tarama: beklenmeyen hata');
    return 'gecici';
  }
}

/**
 * ikas'a sipariş bildirimlerini kaydeder (bağlantı kurulunca). Adres https değilse (yerel)
 * atlanır. Fırlatmaz; başarısızlık yalnız loglanır, saatlik tarama siparişleri yine yakalar.
 */
export async function siparisBildirimleriniKaydet(
  baglantiId: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  let endpoint: string;
  try {
    const u = new URL(env.IKAS_YONLENDIRME_URL);
    if (u.protocol !== 'https:') return false;
    endpoint = `${u.origin}/katilim/ikas/bildirim`;
  } catch {
    return false;
  }
  try {
    const b = await baglantiOku(baglantiId);
    if (!b || b.durum !== 'aktif') return false;
    const ist = baglantiIstemcisi(b, fetchFn);
    if (!ist) return false;
    const d = await ist.sorgu<{ saveWebhook?: { scope: string }[] | null }>(
      'mutation ($input: WebhookInput!) { saveWebhook(input: $input) { id scope endpoint } }',
      { input: { endpoint, scopes: SIPARIS_BILDIRIM_KAPSAMLARI } },
    );
    const kayitli = new Set((d.saveWebhook ?? []).map((w) => w.scope));
    if (!SIPARIS_BILDIRIM_KAPSAMLARI.every((k) => kayitli.has(k))) {
      logger.warn({ baglantiId }, 'siparis: ikas bildirim kaydı eksik döndü');
      return false;
    }
    return true;
  } catch (e) {
    logger.warn({ baglantiId, hata: hataOzeti(e) }, 'siparis: ikas bildirim kaydı başarısız');
    return false;
  }
}
