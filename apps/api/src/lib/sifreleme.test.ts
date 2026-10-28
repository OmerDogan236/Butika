import { expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { coz, sifrele } from './sifreleme';

const anahtar = () => randomBytes(32).toString('base64');

test('sifrele ve coz gidis donus calisir', () => {
  const k = anahtar();
  expect(coz(sifrele('gizli', k), k)).toBe('gizli');
  expect(coz(sifrele('', k), k)).toBe('');
  expect(coz(sifrele('şifre ğüşiöç 🔑', k), k)).toBe('şifre ğüşiöç 🔑');
});

test('ayni girdi iki kez farkli cikti verir ve v1. ile baslar', () => {
  const k = anahtar();
  const a = sifrele('gizli', k);
  const b = sifrele('gizli', k);
  expect(a).not.toBe(b);
  expect(a.startsWith('v1.')).toBe(true);
  expect(a.split('.')).toHaveLength(4);
  expect(a).not.toContain('gizli');
});

test('yanlis anahtar veya bozuk girdi sifre_cozulemedi firlatir', () => {
  const k = anahtar();
  const s = sifrele('gizli', k);
  expect(() => coz(s, anahtar())).toThrow('sifre_cozulemedi');
  const parcalar = s.split('.');
  parcalar[3] = Buffer.from('bozuk').toString('base64url');
  expect(() => coz(parcalar.join('.'), k)).toThrow('sifre_cozulemedi');
  expect(() => coz('v2.a.b.c', k)).toThrow('sifre_cozulemedi');
  expect(() => coz('rastgele', k)).toThrow('sifre_cozulemedi');
});

test('anahtar 32 bayt degilse sifrele hata verir', () => {
  expect(() => sifrele('x', Buffer.from('kisa').toString('base64'))).toThrow();
});
