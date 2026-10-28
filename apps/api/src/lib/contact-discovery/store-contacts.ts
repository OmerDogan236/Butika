import { brandContacts, contactCandidates } from '@butika/db';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import type { TaramaSonucu } from './discover-contacts';

// Tarama sonucunu deftere yazar.
//
// KURALLAR:
// - Adres uydurulmaz: aday yoksa durum 'bulunamadi' kalir, email null olur.
// - Sahibin elle verdigi karar (onaylandi / gecersiz) yeni tarama ile EZILMEZ.
// - doNotContact isareti hicbir kosulda buradan degistirilmez.

export type DefterDurumu = 'bulunamadi' | 'onay_bekliyor' | 'onaylandi' | 'gecersiz';

export async function taramaSonucunuKaydet(sonuc: TaramaSonucu): Promise<void> {
  if (!sonuc.domain) return;

  const [mevcut] = await db
    .select({ id: brandContacts.id, status: brandContacts.status, email: brandContacts.email })
    .from(brandContacts)
    .where(eq(brandContacts.domain, sonuc.domain))
    .limit(1);

  // Sahip daha once karar vermisse o karar korunur; yalniz adaylar tazelenir.
  const sahipKararli = mevcut?.status === 'onaylandi' || mevcut?.status === 'gecersiz';
  const yeniDurum: DefterDurumu = sahipKararli
    ? (mevcut.status as DefterDurumu)
    : sonuc.adaylar.length > 0
      ? 'onay_bekliyor'
      : 'bulunamadi';
  const yeniEmail = sahipKararli ? (mevcut?.email ?? null) : sonuc.onerilen;

  const kayit = {
    domain: sonuc.domain,
    email: yeniEmail,
    status: yeniDurum,
    lastDiscoveryAt: new Date(),
    lastDiscoveryPages: sonuc.acilanSayfalar,
    lastDiscoveryError: sonuc.hata,
    updatedAt: new Date(),
  };

  const [satir] = await db
    .insert(brandContacts)
    .values(kayit)
    .onConflictDoUpdate({ target: brandContacts.domain, set: kayit })
    .returning({ id: brandContacts.id });

  const brandContactId = satir?.id ?? mevcut?.id;
  if (!brandContactId || sonuc.adaylar.length === 0) return;

  await db
    .insert(contactCandidates)
    .values(
      sonuc.adaylar.map((aday) => ({
        brandContactId,
        email: aday.email,
        sourceUrl: aday.sourceUrl,
        sourcePageType: aday.sourcePageType,
        foundIn: aday.foundIn,
        emailType: aday.emailType,
        confidence: aday.confidence,
        confidenceReason: aday.confidenceReason,
      })),
    )
    .onConflictDoNothing();
}

/**
 * Bir markaya tanitim maili gonderilebilir mi?
 *
 * Sahibin kurali: YALNIZ 'onaylandi' durumundaki adreslere mail gider.
 * Dusuk guven, onay bekliyor, gecersiz, bulunamadi ve iletisim istemeyenler
 * kesinlikle disarida kalir. Brevo katmani bu fonksiyonu kullanacak.
 */
export function gonderilebilirMi(kayit: {
  status: string;
  email: string | null;
  doNotContact: boolean;
}): boolean {
  if (kayit.doNotContact) return false;
  if (kayit.status !== 'onaylandi') return false;
  return typeof kayit.email === 'string' && kayit.email.includes('@');
}
