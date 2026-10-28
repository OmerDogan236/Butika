import { z } from 'zod'

export const KOMISYON_ORANI_BP = 1000
export const KATILIM_SARTLARI_SURUMU = '2026-10-deneme'

export type SiparisDurumu = 'odenmedi' | 'hazirlaniyor' | 'kargoda' | 'teslim' | 'iptal'
export type HamDurum = { status: string; odeme: string; paket: string | null }

const ALFABE = 'abcdefghijklmnopqrstuvwxyz234567'

/** 12 karakterlik, [a-z2-7] gönderim kimliği. */
export function yeniGonderimId(): string {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  let s = ''
  for (const x of b) s += ALFABE[x % 32]
  return s
}

/** Mevcut sorgu parametrelerini korur; Butika UTM'lerini ekler/üzerine yazar. */
export function etiketliUrl(url: string, gonderimId: string): string {
  const u = new URL(url)
  u.searchParams.set('utm_source', 'butika')
  u.searchParams.set('utm_medium', 'app')
  u.searchParams.set('utm_campaign', 'baglanti')
  u.searchParams.set('utm_content', gonderimId)
  return u.toString()
}

const ODENDI = new Set(['PAID', 'PARTIALLY_PAID'])
const IADE = new Set(['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_REQUEST_ACCEPTED'])

export function durumuCevir(ham: HamDurum): { durum: SiparisDurumu; odendi: boolean } {
  const odendi = ODENDI.has(ham.odeme)
  if (!odendi) return { durum: 'odenmedi', odendi }
  const { status, paket } = ham
  if (status === 'CANCELLED' || paket === 'CANCELLED') return { durum: 'iptal', odendi }
  if (IADE.has(status) || (paket !== null && IADE.has(paket))) return { durum: 'iptal', odendi }
  if (paket === 'DELIVERED' || paket === 'PARTIALLY_DELIVERED') return { durum: 'teslim', odendi }
  if (paket === 'FULFILLED' || paket === 'PARTIALLY_FULFILLED') return { durum: 'kargoda', odendi }
  return { durum: 'hazirlaniyor', odendi }
}

export function siparisAtfi(
  s: { utmSource: string | null; utmContent: string | null },
  gonderim: { id: string; boutiqueId: string; userId: string | null } | null,
  siparisinButigi: string,
): { gonderimId: string | null; userId: string | null } {
  if (
    s.utmSource === 'butika' &&
    gonderim !== null &&
    gonderim.id === s.utmContent &&
    gonderim.boutiqueId === siparisinButigi
  ) {
    return { gonderimId: gonderim.id, userId: gonderim.userId }
  }
  return { gonderimId: null, userId: null }
}

export function komisyonHesapla(tutarMinor: number): number {
  return Math.round((tutarMinor * KOMISYON_ORANI_BP) / 10000)
}

export function komisyonYazilmali(
  onceki: { komisyonMinor: number | null },
  yeni: { odendi: boolean; gonderimId: string | null },
): boolean {
  return onceki.komisyonMinor === null && yeni.odendi && yeni.gonderimId !== null
}

/**
 * Siparişin tamamı iptal mi (sipariş ya da paket CANCELLED). İade (REFUNDED, REFUND_*) ve
 * kısmi (PARTIALLY_*) durumlar tam iptal sayılmaz.
 */
export function tamIptalMi(ham: HamDurum): boolean {
  return ham.status === 'CANCELLED' || ham.paket === 'CANCELLED'
}

/**
 * İade ya da kısmi iptal/iade durumu: sipariş REFUND*, REFUNDED, PARTIALLY_REFUNDED,
 * PARTIALLY_CANCELLED; paket ayrıca RETURN_*. Kargo/teslim (PARTIALLY_FULFILLED vb.) değil.
 */
export function iadeVeyaKismiMi(ham: HamDurum): boolean {
  const iade = (d: string) =>
    d.startsWith('REFUND') || d === 'PARTIALLY_REFUNDED' || d === 'PARTIALLY_CANCELLED'
  return iade(ham.status) || (ham.paket !== null && (iade(ham.paket) || ham.paket.startsWith('RETURN')))
}

export type KomisyonAlani = {
  komisyonMinor: number | null
  komisyonAt: Date | null
  /** İlk tam iptal görülme anı; denetim izi, yeniden açılınca silinmez. */
  iptalGorulduAt: Date | null
}

/**
 * "İptal edilen siparişten komisyon alınmaz; iadeler takip edilmez":
 * - tam iptal komisyonu (yazılmış olsa bile) siler;
 * - iptalden sonra iade/kısmi durum faturalanmaz;
 * - iptalden sonra ödenmiş ve iade olmayan durum (gerçek yeniden açılma) komisyonu yeniden yazar;
 * - yazılmış komisyon başka hiçbir durumda değişmez.
 */
export function komisyonKarari(
  onceki: KomisyonAlani,
  yeni: {
    odendi: boolean
    gonderimId: string | null
    tamIptal: boolean
    iadeVeyaKismi: boolean
    tutarMinor: number
  },
  simdi: Date,
): KomisyonAlani {
  const iptalGorulduAt = onceki.iptalGorulduAt
  if (yeni.tamIptal)
    return { komisyonMinor: null, komisyonAt: null, iptalGorulduAt: iptalGorulduAt ?? simdi }
  if (iptalGorulduAt && onceki.komisyonMinor === null && yeni.iadeVeyaKismi)
    return { komisyonMinor: null, komisyonAt: null, iptalGorulduAt }
  if (komisyonYazilmali(onceki, yeni))
    return { komisyonMinor: komisyonHesapla(yeni.tutarMinor), komisyonAt: simdi, iptalGorulduAt }
  return { komisyonMinor: onceki.komisyonMinor, komisyonAt: onceki.komisyonAt, iptalGorulduAt }
}

/** "Lujo-Studio.myikas.com " -> "lujo-studio"; ikas mağaza adı biçimine uymuyorsa null. */
export function ikasMagazaAdi(girdi: string): string | null {
  const ad = girdi.trim().toLowerCase().replace(/\.myikas\.com$/, '')
  return /^[a-z0-9-]{1,63}$/.test(ad) ? ad : null
}

/** Admin daveti ve katılım onayında aynı alan: geçerli ikas mağaza adına çevrilir. */
export const magazaAdiSchema = z
  .string()
  .max(100)
  .transform((v, ctx) => {
    const ad = ikasMagazaAdi(v)
    if (!ad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'gecersiz_magaza_adi' })
    return ad ?? ''
  })
