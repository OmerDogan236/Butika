import { describe, expect, test } from 'bun:test'
import {
  durumuCevir,
  etiketliUrl,
  iadeVeyaKismiMi,
  ikasMagazaAdi,
  komisyonHesapla,
  komisyonKarari,
  komisyonYazilmali,
  siparisAtfi,
  tamIptalMi,
  yeniGonderimId,
} from './kurallar'

describe('etiketliUrl', () => {
  test('mevcut parametreleri korur, UTM ekler', () => {
    const u = new URL(etiketliUrl('https://lujostudio.com.tr/kupa?_butika_variant=ikas:1:2', 'abc'))
    expect(u.searchParams.get('_butika_variant')).toBe('ikas:1:2')
    expect(u.searchParams.get('utm_source')).toBe('butika')
    expect(u.searchParams.get('utm_medium')).toBe('app')
    expect(u.searchParams.get('utm_campaign')).toBe('baglanti')
    expect(u.searchParams.get('utm_content')).toBe('abc')
  })
  test('önceki utm_source üzerine yazılır', () => {
    const u = new URL(etiketliUrl('https://x.com/a?utm_source=instagram', 'abc'))
    expect(u.searchParams.getAll('utm_source')).toEqual(['butika'])
  })
})

describe('komisyon', () => {
  test('hesap ve yuvarlama', () => {
    expect(komisyonHesapla(123450)).toBe(12345)
    expect(komisyonHesapla(5)).toBe(1)
  })
  test('komisyonYazilmali', () => {
    expect(komisyonYazilmali({ komisyonMinor: null }, { odendi: false, gonderimId: 'x' })).toBe(false)
    expect(komisyonYazilmali({ komisyonMinor: 500 }, { odendi: true, gonderimId: 'x' })).toBe(false)
    expect(komisyonYazilmali({ komisyonMinor: null }, { odendi: true, gonderimId: null })).toBe(false)
    expect(komisyonYazilmali({ komisyonMinor: null }, { odendi: true, gonderimId: 'x' })).toBe(true)
  })
  test('tamIptalMi: yalnız tam iptal; iade ve kısmi durumlar değil', () => {
    const h = (status: string, paket: string | null, odeme = 'PAID') => ({ status, odeme, paket })
    expect(tamIptalMi(h('CANCELLED', null))).toBe(true)
    expect(tamIptalMi(h('CREATED', 'CANCELLED'))).toBe(true)
    expect(tamIptalMi(h('CANCELLED', 'CANCELLED', 'WAITING'))).toBe(true)
    for (const s of ['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_REQUESTED', 'PARTIALLY_CANCELLED', 'CREATED'])
      expect(tamIptalMi(h(s, null))).toBe(false)
    for (const p of ['REFUNDED', 'REFUND_REQUEST_ACCEPTED', 'PARTIALLY_CANCELLED', 'DELIVERED'])
      expect(tamIptalMi(h('CREATED', p))).toBe(false)
  })
  test('iadeVeyaKismiMi', () => {
    const h = (status: string, paket: string | null) => ({ status, odeme: 'PAID', paket })
    for (const st of ['REFUNDED', 'PARTIALLY_REFUNDED', 'REFUND_REQUESTED', 'REFUND_REJECTED', 'PARTIALLY_CANCELLED'])
      expect(iadeVeyaKismiMi(h(st, null))).toBe(true)
    for (const p of ['REFUNDED', 'REFUND_REQUEST_ACCEPTED', 'PARTIALLY_REFUNDED', 'PARTIALLY_CANCELLED', 'RETURN_REQUESTED'])
      expect(iadeVeyaKismiMi(h('CREATED', p))).toBe(true)
    for (const p of [null, 'FULFILLED', 'PARTIALLY_FULFILLED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'UNFULFILLED'])
      expect(iadeVeyaKismiMi(h('CREATED', p))).toBe(false)
  })
  test('komisyonKarari', () => {
    const simdi = new Date('2026-10-24T10:00:00Z')
    const once = new Date('2026-10-20T10:00:00Z')
    const yok = { komisyonMinor: null, komisyonAt: null, iptalGorulduAt: null }
    const var_ = { komisyonMinor: 1000, komisyonAt: once, iptalGorulduAt: null }
    const iptalli = { komisyonMinor: null, komisyonAt: null, iptalGorulduAt: once }
    const odenen = {
      odendi: true,
      gonderimId: 'x',
      tamIptal: false,
      iadeVeyaKismi: false,
      tutarMinor: 20000,
    }
    // ilk ödeme: yazılır
    expect(komisyonKarari(yok, odenen, simdi)).toEqual({
      komisyonMinor: 2000,
      komisyonAt: simdi,
      iptalGorulduAt: null,
    })
    // yazılmış komisyon tutar değişse de aynı kalır (iadeler takip edilmez)
    expect(komisyonKarari(var_, { ...odenen, tutarMinor: 5 }, simdi)).toEqual(var_)
    expect(komisyonKarari(var_, { ...odenen, odendi: false }, simdi)).toEqual(var_)
    // ödenmemiş ya da atıfsız: yazılmaz
    expect(komisyonKarari(yok, { ...odenen, odendi: false }, simdi)).toEqual(yok)
    expect(komisyonKarari(yok, { ...odenen, gonderimId: null }, simdi)).toEqual(yok)
    // tam iptal: yazılmışsa silinir, iptalken hiç yazılmaz; iptal anı kaydedilir
    expect(komisyonKarari(var_, { ...odenen, tamIptal: true }, simdi)).toEqual({
      ...yok,
      iptalGorulduAt: simdi,
    })
    expect(komisyonKarari(yok, { ...odenen, tamIptal: true }, simdi)).toEqual({
      ...yok,
      iptalGorulduAt: simdi,
    })
    // iptalden sonra iade/kısmi durum: faturalanmaz, ilk iptal anı korunur
    const iade = { ...odenen, iadeVeyaKismi: true }
    expect(komisyonKarari(iptalli, { ...odenen, tamIptal: true }, simdi)).toEqual(iptalli)
    expect(komisyonKarari(iptalli, iade, simdi)).toEqual(iptalli)
    // iptalden sonra gerçek yeniden açılma (ödenmiş, iade değil): komisyon yeniden yazılır, iz kalır
    expect(komisyonKarari(iptalli, odenen, simdi)).toEqual({
      komisyonMinor: 2000,
      komisyonAt: simdi,
      iptalGorulduAt: once,
    })
    // yeniden açılıp yazılmış komisyon sonraki iadede de korunur
    const acilmis = { komisyonMinor: 2000, komisyonAt: simdi, iptalGorulduAt: once }
    expect(komisyonKarari(acilmis, iade, simdi)).toEqual(acilmis)
    // iptal görülmemiş siparişte iade durumu komisyonu engellemez (iadeler takip edilmez)
    expect(komisyonKarari(yok, iade, simdi)).toEqual({
      komisyonMinor: 2000,
      komisyonAt: simdi,
      iptalGorulduAt: null,
    })
  })
})

describe('siparisAtfi', () => {
  const g = { id: 'g1', boutiqueId: 'b1', userId: 'u1' }
  test('eşleşen', () => {
    expect(siparisAtfi({ utmSource: 'butika', utmContent: 'g1' }, g, 'b1')).toEqual({ gonderimId: 'g1', userId: 'u1' })
  })
  test('butik farklı', () => {
    expect(siparisAtfi({ utmSource: 'butika', utmContent: 'g1' }, g, 'b2')).toEqual({ gonderimId: null, userId: null })
  })
  test('utmSource null', () => {
    expect(siparisAtfi({ utmSource: null, utmContent: 'g1' }, g, 'b1')).toEqual({ gonderimId: null, userId: null })
  })
  test('gönderim yok / içerik uyuşmuyor', () => {
    expect(siparisAtfi({ utmSource: 'butika', utmContent: 'g1' }, null, 'b1')).toEqual({ gonderimId: null, userId: null })
    expect(siparisAtfi({ utmSource: 'butika', utmContent: 'zz' }, g, 'b1')).toEqual({ gonderimId: null, userId: null })
  })
})

describe('durumuCevir', () => {
  const h = (status: string, odeme: string, paket: string | null) => durumuCevir({ status, odeme, paket })
  test('ödenmedi', () => {
    expect(h('CREATED', 'FAILED', null)).toEqual({ durum: 'odenmedi', odendi: false })
  })
  test('iptal', () => {
    expect(h('CANCELLED', 'PAID', null)).toEqual({ durum: 'iptal', odendi: true })
    expect(h('REFUNDED', 'PAID', null).durum).toBe('iptal')
    expect(h('CREATED', 'PAID', 'CANCELLED').durum).toBe('iptal')
  })
  test('teslim / kargoda / hazırlanıyor', () => {
    expect(h('CREATED', 'PAID', 'DELIVERED').durum).toBe('teslim')
    expect(h('CREATED', 'PAID', 'FULFILLED').durum).toBe('kargoda')
    expect(h('CREATED', 'PAID', 'UNFULFILLED')).toEqual({ durum: 'hazirlaniyor', odendi: true })
    expect(h('CREATED', 'PARTIALLY_PAID', null).odendi).toBe(true)
  })
})

describe('yeniGonderimId', () => {
  test('biçim ve benzersizlik', () => {
    const s = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = yeniGonderimId()
      expect(id).toMatch(/^[a-z2-7]{12}$/)
      s.add(id)
    }
    expect(s.size).toBe(1000)
  })
})

test('ikasMagazaAdi: .myikas.com kırpılır, biçim dışı null', () => {
  expect(ikasMagazaAdi(' Lujo-Studio.myikas.com ')).toBe('lujo-studio')
  expect(ikasMagazaAdi('dev-x')).toBe('dev-x')
  expect(ikasMagazaAdi('kötü ad!')).toBeNull()
  expect(ikasMagazaAdi('')).toBeNull()
  expect(ikasMagazaAdi('a'.repeat(64))).toBeNull()
})
