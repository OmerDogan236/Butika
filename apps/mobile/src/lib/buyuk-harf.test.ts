import { expect, test } from 'bun:test';
import { buyukHarf } from './buyuk-harf';

test('Türkçe i → İ, ı → I', () =>
  expect(buyukHarf('kategoriler sırala', 'tr')).toBe('KATEGORİLER SIRALA'));
test('İngilizce i → I', () => expect(buyukHarf('recommended', 'en')).toBe('RECOMMENDED'));
test('bölgeli dil kodu', () => expect(buyukHarf('butik', 'tr-TR')).toBe('BUTİK'));
