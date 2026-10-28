import {readWooSelection} from '../lib/price-tracking/woo-selected-product';
import {readModanisaSelection} from '../lib/price-tracking/modanisa-product';
import { readBrandroomSelection } from '../lib/price-tracking/brandroom-stock';
import { readAymarkaSelection } from '../lib/price-tracking/aymarka-stock';
import { readLutvelizadeSelection } from '../lib/price-tracking/lutvelizade-size';
import { readJimmykeySelection } from '../lib/price-tracking/jimmykey-size-stock';
import { hasUnverifiedStock } from '../lib/price-tracking/stock-trust';
import { boutiques, collections, savedProductCollections, savedProducts, trackedProducts } from '@butika/db';
import {
  addToCollectionsSchema,
  purchaseUpdateSchema,
  savedProductCreateSchema,
  savedVariantUpdateSchema,
} from '@butika/types';
import type { RestockAlert, SavedTracking } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';
import { ApiError } from '../lib/errors';
import { kayitHazirla } from '../lib/kayit/kayit-hazirla';
import { urunuKaydet } from '../lib/kayit/urun-kaydet';
import { profiliArkaplandaHesapla } from '../lib/profil/profil-kaydet';
import { ensureTrackedProduct } from '../lib/price-tracking';
import { canonicalizeProductUrl } from '../lib/price-tracking/canonicalize-url';
import { readTicimaxSelection } from '../lib/price-tracking/ticimax-selected-variant';
import { readIkasSelection } from '../lib/price-tracking/ikas-stock';
import { readSchemaSelection } from '../lib/price-tracking/schema-selected-offer';
import { restockAlertState, savedTrackingStatus, unsupportedTracking } from '../lib/price-tracking/saved-tracking-status';
import { RESTOCK_RECHECK_MS } from '../lib/price-tracking/check-schedule';
import { isTrackableProductUrl } from '../lib/price-tracking/product-url-policy';
import { rateLimit } from '../lib/rate-limit';

export const savedRoutes = new Hono<AuthContext>();

savedRoutes.use('*', requireAuth);

// GET /saved → kullanıcının tüm kayıtları, butik bilgisi ile JOIN, en yeni önce.
savedRoutes.get('/', async (c) => {
  const userId = c.get('userId');
  const rows = await db
    .select({
      id: savedProducts.id,
      boutiqueId: savedProducts.boutiqueId,
      url: savedProducts.url,
      title: savedProducts.title,
      imageUrl: savedProducts.imageUrl,
      description: savedProducts.description,
      createdAt: savedProducts.createdAt,
      trackingStartedAt:savedProducts.trackingStartedAt,
      restockAlertAt:savedProducts.restockAlertAt,
      restockConfirmedAt:savedProducts.restockConfirmedAt,
      trackingRow:trackedProducts,
      purchasedAt: savedProducts.purchasedAt,
      orderNumber: savedProducts.orderNumber,
      carrier: savedProducts.carrier,
      trackingNumber: savedProducts.trackingNumber,
      deliveredAt: savedProducts.deliveredAt,
      boutiqueName: boutiques.name,
      boutiqueUrl: boutiques.url,
      boutiqueCoverImageUrl: boutiques.coverImageUrl,
    })
    .from(savedProducts)
    .innerJoin(boutiques, eq(savedProducts.boutiqueId, boutiques.id))
    .leftJoin(trackedProducts,eq(savedProducts.trackedProductId,trackedProducts.id))
    .where(eq(savedProducts.userId, userId))
    .orderBy(desc(savedProducts.createdAt));

  return c.json(
    rows.map((r) => ({
      id: r.id,
      boutiqueId: r.boutiqueId,
      url: r.url,
      title: r.title,
      imageUrl: r.imageUrl,
      description: r.description,
      createdAt: r.createdAt.toISOString(),
      // Butik sitesi dışındaki bağlantılar kayıt olarak kalır ama sunucu onları
      // hiç çekmez; "hazırlanıyor" yerine dürüstçe desteklenmiyor gösterilir.
      tracking: presentedTracking(r.url, r.trackingRow || isTrackableProductUrl(r.url, r.boutiqueUrl)
        ? savedTrackingStatus(r.trackingRow, r.trackingStartedAt)
        : unsupportedTracking()),
      restockAlert: presentedAlert(r.url, r.restockAlertAt, r.restockConfirmedAt),
      purchasedAt: r.purchasedAt?.toISOString() ?? null,
      orderNumber: r.orderNumber,
      carrier: r.carrier,
      trackingNumber: r.trackingNumber,
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      boutique: {
        id: r.boutiqueId,
        name: r.boutiqueName,
        coverImageUrl: r.boutiqueCoverImageUrl,
      },
    })),
  );
});

// POST /saved → idempotent: aynı URL ikinci kez gönderilirse mevcut kaydı döner (200),
// yenisi oluşturulursa 201. Client status'tan saved/unsaved durumunu da çıkarabilir.
savedRoutes.post('/', zValidator('json', savedProductCreateSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');

  // Boutique geçerli mi?
  const [boutique] = await db
    .select({ id: boutiques.id, name: boutiques.name, coverImageUrl: boutiques.coverImageUrl })
    .from(boutiques)
    .where(eq(boutiques.id, body.boutiqueId))
    .limit(1);
  if (!boutique) throw ApiError.badRequest('invalid_boutique', 'boutique not found');
  const { urun, yeni } = await urunuKaydet({ userId, boutique, ...body });
  // Aynı adres başka bir butikte kayıtlıysa (eşzamanlı istek) o butikle döner.
  const butik = urun.boutiqueId === boutique.id ? boutique : await boutiqueLite(urun.boutiqueId);
  return c.json(serializeWithBoutique(urun, butik), yeni ? 201 : 200);
});

// Change size without deleting collections, purchase details or the original save date.
savedRoutes.patch('/:id/variant',zValidator('json',savedVariantUpdateSchema),async c=>{
  const userId=c.get('userId'),id=c.req.param('id'),body=c.req.valid('json');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw ApiError.badRequest('invalid_id','invalid saved product id');
  const [existing]=await db.select().from(savedProducts).where(and(eq(savedProducts.id,id),eq(savedProducts.userId,userId))).limit(1);
  if(!existing)throw ApiError.notFound('saved product not found');
  const selected=new URL(body.url);
  const internal=readLutvelizadeSelection(body.url)??readJimmykeySelection(body.url)??readWooSelection(body.url)??readModanisaSelection(body.url)??readBrandroomSelection(body.url)??readAymarkaSelection(body.url)??readSchemaSelection(body.url)??readIkasSelection(body.url)??readTicimaxSelection(body.url);
  if(internal ? !internal.variantId : selected.searchParams.getAll('variant').length!==1 || !/^[1-9]\d*$/.test(selected.searchParams.get('variant')??''))throw ApiError.badRequest('invalid_variant','variant identity required');
  const schemaChoice=readSchemaSelection(body.url);
  const base=(value:string)=>{const url=new URL(canonicalizeProductUrl(value).canonicalUrl);for(const key of ['variant','vid','_butika_variant'])url.searchParams.delete(key);
    if(schemaChoice)for(const key of [...url.searchParams.keys()])if(/^(beden|renk|size|color|colour)$/i.test(key))url.searchParams.delete(key);
    return url.toString();};
  if(base(existing.url)!==base(body.url))throw ApiError.badRequest('different_product','selection must belong to the same product page');
  const [butik] = await db.select({ name: boutiques.name }).from(boutiques).where(eq(boutiques.id, existing.boutiqueId)).limit(1);
  const hazir = kayitHazirla({ url: body.url, title: body.title, butikAdi: butik?.name ?? '' });
  // Beden/renk seçilebilen sayfa üründür: sınıflandırıcı ne derse desin takip sürer.
  const trackedProductId = await ensureTrackedProduct({ boutiqueId: existing.boutiqueId, url: body.url, title: hazir.title });
  if(!trackedProductId)throw ApiError.internal('tracking selection failed');
  try {
    // Another size starts fresh, without the previous size's stock alert.
    const [updated]=await db.update(savedProducts).set({url:body.url,title:hazir.title,sayfaTuru:'urun',trackedProductId,
      ...(existing.trackedProductId!==trackedProductId?{trackingStartedAt:new Date(),restockAlertAt:null,restockConfirmedAt:null}:{}),
    }).where(and(eq(savedProducts.id,id),eq(savedProducts.userId,userId))).returning();
    if(!updated)throw ApiError.notFound('saved product not found');
    return c.json(serializeWithBoutique(updated,await boutiqueLite(updated.boutiqueId)));
  } catch(error){
    const typed=error as {code?:string;cause?:{code?:string}};
    if((typed.code??typed.cause?.code)==='23505')throw ApiError.conflict('variant_already_saved','this size is already saved separately');
    throw error;
  }
});

// "Stok gelince haber ver" for the saved size/colour. Armed at once when the
// server has seen it sold out; pending while its first check is still due.
savedRoutes.put('/:id/restock-alert', async (c) => {
  const userId = c.get('userId');
  const id = savedId(c.req.param('id'));
  const state = await db.transaction(async (tx) => {
    const [row] = await tx.select({ saved: savedProducts, tracked: trackedProducts }).from(savedProducts)
      .leftJoin(trackedProducts, eq(trackedProducts.id, savedProducts.trackedProductId))
      .where(and(eq(savedProducts.id, id), eq(savedProducts.userId, userId)))
      .limit(1).for('update', { of: savedProducts });
    if (!row) throw ApiError.notFound('saved product not found');
    const { saved, tracked } = row;
    // A store whose stock is withheld can never confirm an alert, so none is offered,
    // not even as pending before the first check.
    if (hasUnverifiedStock(saved.url)) throw ApiError.conflict('stock_unknown', 'stock cannot be verified for this store');
    if (saved.restockAlertAt) return restockAlertState(saved.restockAlertAt, saved.restockConfirmedAt);
    if (!tracked || tracked.trackingStatus !== 'active') throw ApiError.conflict('restock_unavailable', 'stock alerts are unavailable for this link');
    if (tracked.availability === 'in_stock') throw ApiError.conflict('already_in_stock', 'this size is in stock');
    const soldOut = tracked.availability === 'out_of_stock';
    // A product already checked without readable stock can never confirm a sell-out.
    if (!soldOut && tracked.lastSuccessAt) throw ApiError.conflict('stock_unknown', 'stock cannot be verified for this product');
    const now = new Date();
    await tx.update(savedProducts).set({ restockAlertAt: now, restockConfirmedAt: soldOut ? now : null })
      .where(eq(savedProducts.id, id));
    await tx.update(trackedProducts)
      .set({ nextCheckAt: sql`least(${trackedProducts.nextCheckAt}, ${new Date(now.getTime() + RESTOCK_RECHECK_MS).toISOString()}::timestamptz)` })
      .where(eq(trackedProducts.id, tracked.id));
    return soldOut ? 'armed' : 'pending';
  });
  return c.json({ restockAlert: state });
});

savedRoutes.delete('/:id/restock-alert', async (c) => {
  const [row] = await db.update(savedProducts).set({ restockAlertAt: null, restockConfirmedAt: null })
    .where(and(eq(savedProducts.id, savedId(c.req.param('id'))), eq(savedProducts.userId, c.get('userId'))))
    .returning({ id: savedProducts.id });
  if (!row) throw ApiError.notFound('saved product not found');
  return c.json({ restockAlert: 'off' });
});

savedRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const [deleted] = await db
    .delete(savedProducts)
    .where(and(eq(savedProducts.id, id), eq(savedProducts.userId, userId)))
    .returning({ id: savedProducts.id });
  if (!deleted) throw ApiError.notFound('saved product not found');
  profiliArkaplandaHesapla(userId);
  return c.json({ ok: true });
});

// Convenience: URL ile sil. Mobile heart-tap akışında saved id'yi takip etmeye gerek kalmıyor.
savedRoutes.delete('/', async (c) => {
  const userId = c.get('userId');
  const url = c.req.query('url');
  if (!url) throw ApiError.badRequest('missing_url', 'url query param required');
  const deleted = await db
    .delete(savedProducts)
    .where(and(eq(savedProducts.userId, userId), eq(savedProducts.url, url)))
    .returning({ id: savedProducts.id });
  if (deleted.length === 0) throw ApiError.notFound('saved product not found');
  profiliArkaplandaHesapla(userId);
  return c.json({ ok: true });
});

// PATCH /saved/:id/purchase — satın al / detay güncelle / teslim işaretle / geri al.
savedRoutes.patch('/:id/purchase', zValidator('json', purchaseUpdateSchema), async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = c.req.valid('json');

  const [row] = await db
    .select()
    .from(savedProducts)
    .where(and(eq(savedProducts.id, id), eq(savedProducts.userId, userId)))
    .limit(1);
  if (!row) throw ApiError.notFound('saved product not found');

  const patch: Partial<typeof savedProducts.$inferInsert> = {};

  if (body.purchased === false) {
    // Satın almayı geri al — tüm satın alım alanlarını temizle.
    patch.purchasedAt = null;
    patch.deliveredAt = null;
    patch.orderNumber = null;
    patch.carrier = null;
    patch.trackingNumber = null;
  } else {
    if (body.purchased === true && !row.purchasedAt) patch.purchasedAt = new Date();
    if (body.orderNumber !== undefined) patch.orderNumber = body.orderNumber || null;
    if (body.carrier !== undefined) patch.carrier = body.carrier || null;
    if (body.trackingNumber !== undefined) patch.trackingNumber = body.trackingNumber || null;
    if (body.delivered === true) patch.deliveredAt = new Date();
    else if (body.delivered === false) patch.deliveredAt = null;
  }

  if (Object.keys(patch).length === 0) {
    return c.json(serializeWithBoutique(row, await boutiqueLite(row.boutiqueId)));
  }

  const [updated] = await db
    .update(savedProducts)
    .set(patch)
    .where(and(eq(savedProducts.id, id), eq(savedProducts.userId, userId)))
    .returning();
  if (!updated) throw ApiError.internal('purchase update failed');
  if ('purchasedAt' in patch) profiliArkaplandaHesapla(userId);

  return c.json(serializeWithBoutique(updated, await boutiqueLite(updated.boutiqueId)));
});

// POST /saved/:id/collections — bir saved product'ı bir veya birden çok koleksiyona ekle
savedRoutes.post('/:id/collections', zValidator('json', addToCollectionsSchema), async (c) => {
  const userId = c.get('userId');
  const savedId = c.req.param('id');
  const { collectionIds } = c.req.valid('json');

  const [savedRow] = await db
    .select({ id: savedProducts.id })
    .from(savedProducts)
    .where(and(eq(savedProducts.id, savedId), eq(savedProducts.userId, userId)))
    .limit(1);
  if (!savedRow) throw ApiError.notFound('saved product not found');

  const ownCollections = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(inArray(collections.id, collectionIds), eq(collections.userId, userId)));
  if (ownCollections.length !== collectionIds.length) {
    throw ApiError.forbidden('one or more collections do not belong to user');
  }

  await db
    .insert(savedProductCollections)
    .values(
      collectionIds.map((cid) => ({
        savedProductId: savedId,
        collectionId: cid,
      })),
    )
    .onConflictDoNothing();

  await db
    .update(collections)
    .set({ updatedAt: sql`now()` })
    .where(inArray(collections.id, collectionIds));

  return c.json({ ok: true, added: collectionIds.length });
});

// DELETE /saved/:id/collections/:cid — bir koleksiyondan ürünü çıkar (saved kalır)
savedRoutes.delete('/:id/collections/:cid', async (c) => {
  const userId = c.get('userId');
  const savedId = c.req.param('id');
  const cid = c.req.param('cid');

  const [savedRow] = await db
    .select({ id: savedProducts.id })
    .from(savedProducts)
    .where(and(eq(savedProducts.id, savedId), eq(savedProducts.userId, userId)))
    .limit(1);
  if (!savedRow) throw ApiError.notFound('saved product not found');

  const [own] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, cid), eq(collections.userId, userId)))
    .limit(1);
  if (!own) throw ApiError.notFound('collection not found');

  await db
    .delete(savedProductCollections)
    .where(
      and(
        eq(savedProductCollections.savedProductId, savedId),
        eq(savedProductCollections.collectionId, cid),
      ),
    );

  await db.update(collections).set({ updatedAt: sql`now()` }).where(eq(collections.id, cid));

  return c.json({ ok: true });
});

// A store whose stock is withheld (stock-trust) can never confirm an alert or verify
// stock. Stored state is left untouched, but it is never presented as working:
// no alert, and no sold-out or price-drop status that would offer one.
function presentedAlert(url: string, armedAt: Date | null, confirmedAt: Date | null): RestockAlert {
  return hasUnverifiedStock(url) ? 'off' : restockAlertState(armedAt, confirmedAt);
}

function presentedTracking(url: string, tracking: SavedTracking): SavedTracking {
  return hasUnverifiedStock(url) && (tracking.status === 'out_of_stock' || tracking.status === 'active')
    ? { ...tracking, status: 'unverified' } : tracking;
}

function serializeWithBoutique(
  saved: typeof savedProducts.$inferSelect,
  boutique: { id: string; name: string; coverImageUrl: string },
) {
  return {
    id: saved.id,
    boutiqueId: saved.boutiqueId,
    url: saved.url,
    title: saved.title,
    imageUrl: saved.imageUrl,
    description: saved.description,
    createdAt: saved.createdAt.toISOString(),
    restockAlert: presentedAlert(saved.url, saved.restockAlertAt, saved.restockConfirmedAt),
    purchasedAt: saved.purchasedAt?.toISOString() ?? null,
    orderNumber: saved.orderNumber,
    carrier: saved.carrier,
    trackingNumber: saved.trackingNumber,
    deliveredAt: saved.deliveredAt?.toISOString() ?? null,
    boutique,
  };
}

function savedId(id: string): string {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw ApiError.badRequest('invalid_id', 'invalid saved product id');
  return id;
}

async function boutiqueLite(
  id: string,
): Promise<{ id: string; name: string; coverImageUrl: string }> {
  const [b] = await db
    .select({ id: boutiques.id, name: boutiques.name, coverImageUrl: boutiques.coverImageUrl })
    .from(boutiques)
    .where(eq(boutiques.id, id))
    .limit(1);
  return b ?? { id, name: '', coverImageUrl: '' };
}
