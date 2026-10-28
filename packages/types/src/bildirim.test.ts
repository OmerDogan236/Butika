import { expect, test } from 'bun:test';
import { bildirimHedefiCoz, bildirimOlusturSchema } from './bildirim';

const ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';

test('hedef çözülür; bilinmeyen ya da bozuk değer null', () => {
  expect(bildirimHedefiCoz('firsat')).toEqual({ tur: 'firsat' });
  expect(bildirimHedefiCoz(`butik:${ID}`)).toEqual({ tur: 'butik', id: ID });
  expect(bildirimHedefiCoz(`kategori:${ID}`)).toEqual({ tur: 'kategori', id: ID });
  expect(bildirimHedefiCoz('butik:abc')).toBeNull();
  expect(bildirimHedefiCoz('magaza')).toBeNull();
  expect(bildirimHedefiCoz(null)).toBeNull();
});

test('form gövdesinde hedef verilmezse null', () => {
  const r = bildirimOlusturSchema.parse({
    baslik: 'a',
    metin: 'b',
    gonderimZamani: '2026-10-20T12:30:00+03:00',
  });
  expect(r.hedef).toBeNull();
});
