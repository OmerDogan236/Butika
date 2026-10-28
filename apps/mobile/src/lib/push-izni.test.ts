import { expect, test } from 'bun:test';
import { izinDegeri, izinDegisimi } from './push-izni';

test('iOS geçici izin ayrı sayılır', () => {
  expect(izinDegeri({ status: 'granted', ios: { status: 3 } })).toBe('provisional');
  expect(izinDegeri({ status: 'granted', ios: { status: 2 } })).toBe('granted');
});

test('Android ve diğer durumlar', () => {
  expect(izinDegeri({ status: 'granted' })).toBe('granted');
  expect(izinDegeri({ status: 'denied', ios: null })).toBe('denied');
  expect(izinDegeri({ status: 'undetermined' })).toBe('not_determined');
});

test('değişim: yalnız önceki değer biliniyor ve farklıysa', () => {
  expect(izinDegisimi(null, 'granted')).toBeNull();
  expect(izinDegisimi('granted', 'granted')).toBeNull();
  expect(izinDegisimi('granted', 'denied')).toEqual({ from: 'granted', to: 'denied' });
});
