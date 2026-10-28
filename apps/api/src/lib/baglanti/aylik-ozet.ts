import { butikBaglantilari, butikSiparisleri, gonderimler } from '@butika/db';
import { and, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../logger';
import { brevoHazirMi, brevoMailGonder } from '../outreach/brevo';
import { type MailIcerigi, htmlKacis } from '../outreach/template';

export type Ay = { yil: number; ay: number };
export type AylikOzet = {
  /** Ay içinde Butika'dan mağazaya giden farklı kullanıcı sayısı. */
  kisiSayisi: number;
  satisAdedi: number;
  satisTutariMinor: number;
  komisyonMinor: number;
  currency: string;
};
type Tahsilat = 'deneme' | 'ikas' | 'havale';

const AY_ADLARI = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
const OZET_SAATI = 10;

// Ayın başı, Europe/Istanbul takvimine göre (yönetici listesiyle aynı yaklaşım).
function ayBasi({ yil, ay }: Ay) {
  return sql`make_timestamptz(${yil}::int, ${ay}::int, 1, 0, 0, 0, 'Europe/Istanbul')`;
}
function sonrakiAyBasi({ yil, ay }: Ay) {
  return ay === 12 ? ayBasi({ yil: yil + 1, ay: 1 }) : ayBasi({ yil, ay: ay + 1 });
}

export function ayAnahtari({ yil, ay }: Ay): string {
  return `${yil}-${String(ay).padStart(2, '0')}`;
}
export function ayAdi({ yil, ay }: Ay): string {
  return `${AY_ADLARI[ay - 1]} ${yil}`;
}

function istanbulParcalari(simdi: Date) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(simdi);
  const al = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { yil: al('year'), ay: al('month'), gun: al('day'), saat: al('hour') };
}

/** İstanbul saatine göre özet zamanı geldiyse (ayın 1'i 10:00 sonrası) önceki ayı verir. */
export function ozetAyi(simdi: Date): Ay | null {
  const { yil, ay, gun, saat } = istanbulParcalari(simdi);
  if (gun === 1 && saat < OZET_SAATI) return null;
  return ay === 1 ? { yil: yil - 1, ay: 12 } : { yil, ay: ay - 1 };
}

export async function aylikOzetHesapla(baglantiId: string, ay: Ay): Promise<AylikOzet> {
  const [b] = await db
    .select({ boutiqueId: butikBaglantilari.boutiqueId })
    .from(butikBaglantilari)
    .where(eq(butikBaglantilari.id, baglantiId));
  if (!b) throw new Error('baglanti_yok');

  const [g] = await db
    .select({ n: sql<number>`count(distinct ${gonderimler.userId})::int` })
    .from(gonderimler)
    .where(
      and(
        eq(gonderimler.boutiqueId, b.boutiqueId),
        gte(gonderimler.createdAt, ayBasi(ay)),
        lt(gonderimler.createdAt, sonrakiAyBasi(ay)),
      ),
    );

  // Pilotta tek para birimi var: en çok satışı olan para birimi alınır, diğerleri sayılmaz.
  // Satış = komisyon taşıyabilen sipariş; tamamen iptal edilen (komisyonu silinen) sayılmaz.
  const satirlar = await db
    .select({
      currency: butikSiparisleri.currency,
      adet: sql<number>`count(*)::int`,
      tutar: sql<number>`coalesce(sum(${butikSiparisleri.tutarMinor}), 0)::int`,
      komisyon: sql<number>`coalesce(sum(${butikSiparisleri.komisyonMinor}), 0)::int`,
    })
    .from(butikSiparisleri)
    .where(
      and(
        eq(butikSiparisleri.baglantiId, baglantiId),
        eq(butikSiparisleri.odendi, true),
        isNotNull(butikSiparisleri.gonderimId),
        isNotNull(butikSiparisleri.komisyonMinor),
        gte(butikSiparisleri.siparisAt, ayBasi(ay)),
        lt(butikSiparisleri.siparisAt, sonrakiAyBasi(ay)),
      ),
    )
    .groupBy(butikSiparisleri.currency);
  const [baskin] = [...satirlar].sort(
    (a, c) => c.adet - a.adet || a.currency.localeCompare(c.currency),
  );
  return {
    kisiSayisi: g?.n ?? 0,
    satisAdedi: baskin?.adet ?? 0,
    satisTutariMinor: baskin?.tutar ?? 0,
    komisyonMinor: baskin?.komisyon ?? 0,
    currency: baskin?.currency ?? 'TRY',
  };
}

/** 1234500 -> "12.345,00 TL"; TL dışında para birimi kodu sayının ardından gelir. */
export function paraYaz(minor: number, currency: string): string {
  const sayi = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
  return `${sayi} ${currency === 'TRY' ? 'TL' : currency}`;
}

export function aylikOzetMaili(
  butikAdi: string,
  ayAdiMetni: string,
  o: AylikOzet,
  tahsilat: Tahsilat,
): MailIcerigi {
  const tutar = paraYaz(o.satisTutariMinor, o.currency);
  const komisyon = paraYaz(o.komisyonMinor, o.currency);
  const satirlar = [
    `Merhaba ${butikAdi} ekibi,`,
    `${ayAdiMetni} ayının özeti: Butika'dan ${o.kisiSayisi} kişi mağazanıza geldi, ${o.satisAdedi} satış oldu, toplam ${tutar}. Komisyon: ${komisyon}.`,
    tahsilat === 'deneme'
      ? 'Deneme dönemindesiniz, bu tutar tahsil edilmeyecek.'
      : 'Komisyon ödemesiyle ilgili ayrıca sizinle iletişime geçeceğiz.',
    'Sorunuz olursa bu e-postayı yanıtlamanız yeterli.',
    'Sevgiler,\n\n[Kurucu Adı]\nKurucu, Butika\nhttps://butika.ai',
  ];
  const text = satirlar.join('\n\n');
  const subject = `Butika ${ayAdiMetni} özetiniz`;
  const paragraflar = satirlar
    .map((p) => `<p style="margin:0 0 16px;">${htmlKacis(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n      ');
  const html = `<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>${htmlKacis(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#ffffff;">
    <div style="max-width:600px; margin:0 auto; padding:24px 20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; font-size:15px; line-height:1.6; color:#1c1c1c;">
      ${paragraflar}
    </div>
  </body>
</html>`;
  return { subject, text, html };
}

type Bagimliliklar = {
  mailGonder?: typeof brevoMailGonder;
  brevoHazir?: () => boolean;
};

/**
 * Zamanı geldiyse, önceki ay için özeti henüz gitmemiş aktif/kopmuş bağlantılara
 * mail gönderir. sonOzetAyi yalnız mail başarılı olunca yazılır. Gönderilen sayısını döner.
 */
export async function aylikOzetleriGonder(simdi: Date, deps: Bagimliliklar = {}): Promise<number> {
  const ay = ozetAyi(simdi);
  if (!ay) return 0;
  const hazir = deps.brevoHazir ?? brevoHazirMi;
  const gonder = deps.mailGonder ?? brevoMailGonder;
  if (!hazir()) {
    logger.warn('baglanti-ozet: Brevo hazır değil, özet gönderilmedi');
    return 0;
  }
  const anahtar = ayAnahtari(ay);
  const bekleyenler = await db
    .select({
      id: butikBaglantilari.id,
      ad: sql<string>`(select name from boutiques where boutiques.id = ${butikBaglantilari.boutiqueId})`,
      tahsilat: butikBaglantilari.tahsilat,
      eposta: butikBaglantilari.iletisimEposta,
    })
    .from(butikBaglantilari)
    .where(
      and(
        sql`${butikBaglantilari.durum} in ('aktif', 'koptu')`,
        sql`(${butikBaglantilari.sonOzetAyi} is null or ${butikBaglantilari.sonOzetAyi} < ${anahtar})`,
        // Özet ayı bitmeden bağlanmış olmalı (bu ay bağlananlara boş özet gitmesin)
        lt(butikBaglantilari.onayAt, sonrakiAyBasi(ay)),
      ),
    );
  let gonderilen = 0;
  for (const b of bekleyenler) {
    try {
      const ozet = await aylikOzetHesapla(b.id, ay);
      const sonuc = await gonder(
        b.eposta,
        aylikOzetMaili(b.ad, ayAdi(ay), ozet, b.tahsilat as Tahsilat),
        ['baglanti-ozet'],
      );
      if (!sonuc.ok) {
        logger.error(
          { baglantiId: b.id, hata: sonuc.hata.slice(0, 80) },
          'baglanti-ozet: mail gitmedi',
        );
        continue;
      }
      await db
        .update(butikBaglantilari)
        .set({ sonOzetAyi: anahtar })
        .where(eq(butikBaglantilari.id, b.id));
      gonderilen++;
    } catch (error) {
      logger.error({ baglantiId: b.id, error: String(error).slice(0, 200) }, 'baglanti-ozet: hata');
    }
  }
  return gonderilen;
}
