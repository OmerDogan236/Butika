import { describe, expect, it } from 'bun:test';
import { icHesapMi } from './ic-hesap';

describe('icHesapMi', () => {
  it('sahibin adresini büyük/küçük harf ve boşluktan bağımsız tanır', () => {
    expect(icHesapMi('kurucu@example.com')).toBe(true);
    expect(icHesapMi('  Kurucu@Example.com ')).toBe(true);
  });

  it('gerçek kullanıcıyı ve boş adresi iç hesap saymaz', () => {
    expect(icHesapMi('kullanici@example.com')).toBe(false);
    expect(icHesapMi(null)).toBe(false);
    expect(icHesapMi(undefined)).toBe(false);
    expect(icHesapMi('')).toBe(false);
  });
});
