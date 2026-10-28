import { shopifyUygulamalari } from '@butika/db';
import { eq } from 'drizzle-orm';
import { env } from '../../../env';
import { db } from '../../db';
import { coz, sifrele } from '../../sifreleme';

function anahtar(): string {
  if (!env.BAGLANTI_SIFRELEME_ANAHTARI) throw new Error('sifreleme_anahtari_yok');
  return env.BAGLANTI_SIFRELEME_ANAHTARI;
}

/** Mağazanın Partner uygulaması anahtarları; kayıt yoksa null. */
export async function shopifyUygulamasi(
  magaza: string,
): Promise<{ clientId: string; secret: string } | null> {
  const [satir] = await db
    .select()
    .from(shopifyUygulamalari)
    .where(eq(shopifyUygulamalari.magaza, magaza))
    .limit(1);
  if (!satir) return null;
  return { clientId: satir.clientId, secret: coz(satir.secretSifreli, anahtar()) };
}

/** `vt`: davetle aynı transaction'da yazmak için (davet yazılamazsa anahtar da kalmaz). */
export async function shopifyUygulamasiKaydet(
  magaza: string,
  clientId: string,
  secret: string,
  vt: Pick<typeof db, 'insert'> = db,
): Promise<void> {
  const secretSifreli = sifrele(secret, anahtar());
  await vt
    .insert(shopifyUygulamalari)
    .values({ magaza, clientId, secretSifreli })
    .onConflictDoUpdate({
      target: shopifyUygulamalari.magaza,
      set: { clientId, secretSifreli, updatedAt: new Date() },
    });
}
