import { expect, test } from 'bun:test';
import { duyuruHedefi } from './bildirim-hedefi';

const ID = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d';
const duyuru = (target?: unknown) => ({ type: 'announcement', campaign: 'admin-1', target });

test('sekmeler, mağaza, butik ve kategori', () => {
  expect(duyuruHedefi(duyuru('vitrin'))).toEqual({ tur: 'sekme', yol: '/(tabs)' });
  expect(duyuruHedefi(duyuru('firsat'))).toEqual({ tur: 'sekme', yol: '/firsat' });
  expect(duyuruHedefi(duyuru('butikcan'))).toEqual({ tur: 'sekme', yol: '/butikcan' });
  expect(duyuruHedefi(duyuru('guncelleme'))).toEqual({ tur: 'magaza' });
  expect(duyuruHedefi(duyuru(`butik:${ID}`))).toEqual({ tur: 'butik', id: ID });
  expect(duyuruHedefi(duyuru(`kategori:${ID}`))).toEqual({ tur: 'kategori', id: ID });
});

test('hedefsiz, bozuk ya da duyuru olmayan bildirim yalnız uygulamayı açar', () => {
  expect(duyuruHedefi(duyuru())).toBeNull();
  expect(duyuruHedefi(duyuru('magaza'))).toBeNull();
  expect(duyuruHedefi(duyuru('butik:abc'))).toBeNull();
  expect(duyuruHedefi(duyuru('constructor'))).toBeNull();
  expect(duyuruHedefi({ type: 'price_drop', target: 'firsat' })).toBeNull();
  expect(duyuruHedefi(null)).toBeNull();
});
