import { baglantiUrunleri, boutiques, butikBaglantilari, butikSiparisleri } from '@butika/db';
import { type ButikSiparisi, siparisDurumuSchema } from '@butika/types';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { pilotKullanicisiMi } from '../lib/baglanti/pilot';
import { db } from '../lib/db';

export const siparislerRoutes = new Hono<AuthContext>();

siparislerRoutes.use('*', requireAuth);

// Satın Aldıklarım: kullanıcının bağlı butiklerden otomatik okunan siparişleri (ödenmemişler hariç).
siparislerRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  if (!pilotKullanicisiMi(userId)) return c.json({ pilot: false, siparisler: [] });

  const rows = await db
    .select({
      siparis: butikSiparisleri,
      butikAdi: boutiques.name,
      butikUrl: boutiques.url,
      iadePolitikasi: butikBaglantilari.iadePolitikasi,
    })
    .from(butikSiparisleri)
    .innerJoin(boutiques, eq(boutiques.id, butikSiparisleri.boutiqueId))
    .innerJoin(butikBaglantilari, eq(butikBaglantilari.id, butikSiparisleri.baglantiId))
    .where(and(eq(butikSiparisleri.userId, userId), ne(butikSiparisleri.durum, 'odenmedi')))
    .orderBy(desc(butikSiparisleri.siparisAt));

  // Satır görseli/linki: tek sorguda, ürün düzeyi satır önde; pasif ürünler de kullanılır.
  const baglantiIdleri = [...new Set(rows.map((r) => r.siparis.baglantiId))];
  const urunler = baglantiIdleri.length
    ? await db
        .select({
          baglantiId: baglantiUrunleri.baglantiId,
          disUrunId: baglantiUrunleri.disUrunId,
          disVaryantId: baglantiUrunleri.disVaryantId,
          url: baglantiUrunleri.url,
          gorseller: baglantiUrunleri.gorseller,
        })
        .from(baglantiUrunleri)
        .where(inArray(baglantiUrunleri.baglantiId, baglantiIdleri))
    : [];
  const urunHaritasi = new Map<string, (typeof urunler)[number]>();
  for (const u of urunler) {
    if (!u.disUrunId) continue;
    const anahtar = `${u.baglantiId}:${u.disUrunId}`;
    const var_ = urunHaritasi.get(anahtar);
    if (!var_ || (var_.disVaryantId !== null && u.disVaryantId === null)) {
      urunHaritasi.set(anahtar, u);
    }
  }

  const siparisler: ButikSiparisi[] = rows.map(
    ({ siparis: s, butikAdi, butikUrl, iadePolitikasi }) => ({
      id: s.id,
      butikAdi,
      boutiqueId: s.boutiqueId,
      siparisNo: s.siparisNo,
      siparisAt: s.siparisAt.toISOString(),
      durum: siparisDurumuSchema.catch('hazirlaniyor').parse(s.durum),
      satirlar: (s.satirlar ?? []).map((l) => {
        const u = l.disUrunId ? urunHaritasi.get(`${s.baglantiId}:${l.disUrunId}`) : undefined;
        return {
          ad: l.ad,
          adet: l.adet,
          gorsel: u?.gorseller?.[0] ?? null,
          urunUrl: u?.url ?? null,
        };
      }),
      tutarMinor: s.tutarMinor,
      currency: s.currency,
      kargoFirmasi: s.kargoFirmasi,
      takipNo: s.takipNo,
      takipUrl: s.takipUrl,
      iadePolitikasi,
      butikUrl,
    }),
  );

  return c.json({ pilot: true, siparisler });
});
