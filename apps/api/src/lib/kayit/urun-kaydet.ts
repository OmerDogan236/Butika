import { savedProducts } from '@butika/db';
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { ensureTrackedProduct } from '../price-tracking';
import { profiliArkaplandaHesapla } from '../profil/profil-kaydet';
import { kayitHazirla } from './kayit-hazirla';

export type KayitliUrun = typeof savedProducts.$inferSelect;

/**
 * Kullanıcının bir ürünü Kayıtlı'ya alması: uygulama içi tarayıcıdaki "Butika'ya Kaydet"
 * (POST /saved) ve paylaşım menüsünden gelen ürün sayfası (POST /kayitli-butikler/paylasim)
 * aynı yoldan geçer. Ürün sayfasıysa fiyat/stok takibi başlar. Aynı adres zaten kayıtlıysa
 * yeni kayıt açılmaz (takibi yoksa takip eklenir). Butiğin varlığını çağıran doğrular.
 */
export async function urunuKaydet(p: {
  userId: string;
  boutique: { id: string; name: string };
  url: string;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
}): Promise<{ urun: KayitliUrun; yeni: boolean }> {
  const hazir = kayitHazirla({ url: p.url, title: p.title, butikAdi: p.boutique.name });
  const takip = () =>
    hazir.takipEdilsin
      ? ensureTrackedProduct({
          boutiqueId: p.boutique.id,
          url: p.url,
          title: hazir.title,
          priceMinor: p.priceMinor ?? null,
          currency: p.currency ?? null,
        })
      : Promise.resolve(null);

  const [existing] = await db
    .select()
    .from(savedProducts)
    .where(and(eq(savedProducts.userId, p.userId), eq(savedProducts.url, p.url)))
    .limit(1);
  if (existing) {
    if (!existing.trackedProductId) {
      const trackedProductId = await takip();
      if (trackedProductId) {
        const [updated] = await db
          .update(savedProducts)
          .set({ trackedProductId, trackingStartedAt: new Date() })
          .where(eq(savedProducts.id, existing.id))
          .returning();
        if (updated) return { urun: updated, yeni: false };
      }
    }
    return { urun: existing, yeni: false };
  }

  const trackedProductId = await takip();
  const [created] = await db
    .insert(savedProducts)
    .values({
      userId: p.userId,
      boutiqueId: p.boutique.id,
      url: p.url,
      title: hazir.title,
      sayfaTuru: hazir.sayfaTuru,
      // iOS (App Transport Security) http:// görselleri engelliyor → https'e normalize et.
      imageUrl: p.imageUrl ? p.imageUrl.replace(/^http:\/\//i, 'https://') : null,
      description: p.description ?? null,
      trackedProductId,
    })
    .onConflictDoNothing({ target: [savedProducts.userId, savedProducts.url] })
    .returning();

  if (!created) {
    const [concurrent] = await db
      .select()
      .from(savedProducts)
      .where(and(eq(savedProducts.userId, p.userId), eq(savedProducts.url, p.url)))
      .limit(1);
    if (!concurrent) throw new Error('save failed');
    return { urun: concurrent, yeni: false };
  }
  // Profil arka planda güncellenir; isteği bekletmez, hata vermez.
  profiliArkaplandaHesapla(p.userId);
  return { urun: created, yeni: true };
}
