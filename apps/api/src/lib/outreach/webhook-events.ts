// Brevo webhook olaylarini ic durumlarimiza cevirir.
//
// Brevo'nun guncel transactional olay adlari (developers.brevo.com,
// "Transactional webhooks"): request, delivered, opened, unique_opened, click,
// hard_bounce, soft_bounce, blocked, spam, unsubscribed, invalid_email,
// deferred, error.

export type IcDurum =
  | 'gonderildi'
  | 'ulasti'
  | 'acildi'
  | 'tiklandi'
  | 'geri_dondu'
  | 'engellendi'
  | 'listeden_cikti'
  | 'basarisiz';

/** Hangi olay hangi zaman alanini doldurur. */
export type ZamanAlani =
  | 'sentAt'
  | 'deliveredAt'
  | 'openedAt'
  | 'clickedAt'
  | 'bouncedAt'
  | 'blockedAt'
  | 'unsubscribedAt'
  | null;

export type OlayEslesmesi = {
  durum: IcDurum;
  alan: ZamanAlani;
  /** Durum ilerlemesi: kucuk olan geriye donmez (acilmis mail "ulasti"ya dusmez). */
  sira: number;
};

const ESLESMELER: Record<string, OlayEslesmesi> = {
  request: { durum: 'gonderildi', alan: 'sentAt', sira: 1 },
  sent: { durum: 'gonderildi', alan: 'sentAt', sira: 1 },
  delivered: { durum: 'ulasti', alan: 'deliveredAt', sira: 2 },
  opened: { durum: 'acildi', alan: 'openedAt', sira: 3 },
  unique_opened: { durum: 'acildi', alan: 'openedAt', sira: 3 },
  click: { durum: 'tiklandi', alan: 'clickedAt', sira: 4 },
  clicked: { durum: 'tiklandi', alan: 'clickedAt', sira: 4 },
  // Olumsuz sonuclar sirasi yuksek: hangi asamada olursa olsun son durumdur.
  soft_bounce: { durum: 'geri_dondu', alan: 'bouncedAt', sira: 8 },
  hard_bounce: { durum: 'geri_dondu', alan: 'bouncedAt', sira: 9 },
  invalid_email: { durum: 'geri_dondu', alan: 'bouncedAt', sira: 9 },
  blocked: { durum: 'engellendi', alan: 'blockedAt', sira: 9 },
  spam: { durum: 'engellendi', alan: 'blockedAt', sira: 9 },
  unsubscribed: { durum: 'listeden_cikti', alan: 'unsubscribedAt', sira: 10 },
  deferred: { durum: 'gonderildi', alan: null, sira: 1 },
  error: { durum: 'basarisiz', alan: null, sira: 7 },
};

export function olayEslesmesi(olay: string): OlayEslesmesi | null {
  return ESLESMELER[olay.trim().toLowerCase()] ?? null;
}

const DURUM_SIRASI: Record<string, number> = {
  hazirlaniyor: 0,
  gonderildi: 1,
  ulasti: 2,
  acildi: 3,
  tiklandi: 4,
  basarisiz: 7,
  geri_dondu: 9,
  engellendi: 9,
  listeden_cikti: 10,
};

/**
 * Yeni olay mevcut durumu ilerletiyor mu? Olaylar sirasiz gelebilir; "acildi"
 * yazan bir kayit, gec gelen "ulasti" olayi yuzunden geri dusmemeli.
 */
export function durumIlerletilmeli(mevcut: string, yeni: IcDurum): boolean {
  return (DURUM_SIRASI[yeni] ?? 0) > (DURUM_SIRASI[mevcut] ?? 0);
}

/** Brevo zaman damgasini Date'e cevirir (ts saniye, date metin olabilir). */
export function olayZamani(govde: { ts?: number; ts_event?: number; date?: string }): Date {
  const saniye = govde.ts_event ?? govde.ts;
  if (typeof saniye === 'number' && Number.isFinite(saniye)) return new Date(saniye * 1000);
  if (govde.date) {
    const d = new Date(govde.date.replace(' ', 'T'));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
