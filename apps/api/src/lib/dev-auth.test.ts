import { expect, test } from 'bun:test';
import { devGirisAcikMi } from './dev-auth';

test('production her zaman kapalı', () => expect(devGirisAcikMi('production', true)).toBe(false));
test('development + kapalı şalter → kapalı', () =>
  expect(devGirisAcikMi('development', false)).toBe(false));
test('development + açık şalter → açık', () =>
  expect(devGirisAcikMi('development', true)).toBe(true));
test('test + kapalı şalter → kapalı', () => expect(devGirisAcikMi('test', false)).toBe(false));
