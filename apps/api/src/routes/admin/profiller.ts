import {
  events,
  boutiques,
  categories,
  kullaniciProfilleri,
  savedProducts,
  tarzTestiCevaplari,
  users,
} from '@butika/db';
import { PROFIL_RAPOR_ARALIKLARI, type ProfilRaporu } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { env } from '../../env';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';
import {
  type FarkKisisi,
  profilListeSatiri,
  profilOzeti,
  testDavranisFarki,
  vitrinAcmaRaporu,
} from '../../lib/profil/profil-rapor';
import { oneriRaporu } from '../../lib/tarz-testi-rapor';

// Admin "Kullanıcı Profilleri" raporu. İsimsiz: kısa kimlik; isim/e-posta yalnız
// PROFIL_RAPOR_KIMLIK_GOSTER açıkken. Yalnız okur.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (§5)

export const adminProfillerRoutes = new Hono<AdminContext>();

adminProfillerRoutes.use('*', requireAdmin);

const ARALIK_GUN = { '7d': 7, '30d': 30, '90d': 90 } as const;
/** Listede en son güncellenen bu kadar profil. */
const LISTE_SINIRI = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

adminProfillerRoutes.get(
  '/',
  zValidator('query', z.object({ range: z.enum(PROFIL_RAPOR_ARALIKLARI).default('30d') })),
  async (c) => {
    const { range } = c.req.valid('query');
    const since = new Date(Date.now() - ARALIK_GUN[range] * 24 * 60 * 60 * 1000);
    const kimlikGoster = env.PROFIL_RAPOR_KIMLIK_GOSTER;

    const [profiller, testler, kayitlar, olaylar] = await Promise.all([
      // Silinmeyi bekleyen hesaplar rapora girmez (gece hesabı da onları atlar).
      db
        .select({
          userId: kullaniciProfilleri.userId,
          kaynak: kullaniciProfilleri.kaynak,
          tarz: kullaniciProfilleri.tarz,
          butce: kullaniciProfilleri.butce,
          kategoriler: kullaniciProfilleri.kategoriler,
          yasAraligi: kullaniciProfilleri.yasAraligi,
          kayitSayisi: kullaniciProfilleri.kayitSayisi,
          guncellendi: kullaniciProfilleri.guncellendi,
          ad: users.displayName,
          eposta: users.email,
        })
        .from(kullaniciProfilleri)
        .innerJoin(users, eq(users.id, kullaniciProfilleri.userId))
        .where(isNull(users.deletedAt))
        .orderBy(desc(kullaniciProfilleri.guncellendi)),
      db
        .select({
          userId: tarzTestiCevaplari.userId,
          tarz1: tarzTestiCevaplari.tarz1,
          tarz2: tarzTestiCevaplari.tarz2,
          fiyatSegmentleri: tarzTestiCevaplari.fiyatSegmentleri,
        })
        .from(tarzTestiCevaplari)
        .orderBy(desc(tarzTestiCevaplari.createdAt)),
      db
        .select({
          userId: savedProducts.userId,
          tarz1: boutiques.tarz1,
          tarz2: boutiques.tarz2,
          fiyatSegmenti: boutiques.fiyatSegmenti,
        })
        .from(savedProducts)
        .innerJoin(boutiques, eq(boutiques.id, savedProducts.boutiqueId)),
      db
        .select({
          userId: events.userId,
          type: events.type,
          payload: events.payload,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(
          and(
            gte(events.createdAt, since),
            inArray(events.type, ['oneri_gosterildi', 'oneri_tiklandi', 'boutique_view']),
          ),
        ),
    ]);

    // Kişi başına son test (sorgu yeniden eskiye sıralı) ve kayıtlar.
    const kisiler = new Map<string, FarkKisisi>();
    for (const t of testler) {
      if (kisiler.has(t.userId)) continue;
      kisiler.set(t.userId, {
        test: { tarz1: t.tarz1, tarz2: t.tarz2, fiyatSegmentleri: t.fiyatSegmentleri },
        kayitlar: [],
      });
    }
    for (const k of kayitlar) {
      const kisi = kisiler.get(k.userId);
      if (kisi) kisi.kayitlar.push(k);
    }

    const liste = profiller.slice(0, LISTE_SINIRI);
    const kategoriIdleri = [
      ...new Set(profiller.flatMap((p) => Object.keys(p.kategoriler ?? {}))),
    ].filter((id) => UUID_RE.test(id));
    const adlar = kategoriIdleri.length
      ? await db
          .select({ id: categories.id, name: categories.name, ulke: categories.countryCode })
          .from(categories)
          .where(inArray(categories.id, kategoriIdleri))
      : [];
    const kategoriAdi = new Map(adlar.map((k) => [k.id, `${k.name.trim()} (${k.ulke})`]));

    const ozet = profilOzeti(profiller);
    const raporOlaylari = olaylar.map((o) => ({
      ...o,
      payload: (o.payload ?? {}) as Record<string, unknown>,
    }));
    const oneri = oneriRaporu(raporOlaylari);
    const rapor: ProfilRaporu = {
      range,
      anahtarlar: {
        hesap: env.PROFIL_HESAP_ENABLED,
        vitrin: env.PROFIL_VITRIN_ENABLED,
        kimlikGoster,
      },
      ozet: {
        ...ozet,
        kategoriler: ozet.kategoriler.map((k) => ({
          ...k,
          anahtar: kategoriAdi.get(k.anahtar) ?? k.anahtar,
        })),
      },
      fark: testDavranisFarki([...kisiler.values()]),
      kullanicilar: {
        toplam: profiller.length,
        satirlar: liste.map((p) =>
          profilListeSatiri(
            p,
            kategoriAdi,
            kimlikGoster ? { ad: p.ad, eposta: p.eposta } : undefined,
          ),
        ),
      },
      oneri: {
        gosterim: oneri.gosterim,
        tiklama: oneri.tiklama,
        tiklamaOrani: oneri.tiklamaOrani,
        vitrin: vitrinAcmaRaporu(raporOlaylari),
      },
    };
    return c.json(rapor);
  },
);
