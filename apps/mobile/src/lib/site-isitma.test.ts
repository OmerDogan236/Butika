import { afterEach, describe, expect, mock, test } from 'bun:test';
import { adresiIsit, isitmaHafizasiniTemizle } from './site-isitma';

const gercekFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = gercekFetch;
  isitmaHafizasiniTemizle();
});

describe('adres ısıtma', () => {
  test('aynı alan adı yalnız bir kez ısıtılır', () => {
    const cagrilar: RequestInit[] = [];
    const sahte = mock((_url: string, init?: RequestInit) => {
      cagrilar.push(init ?? {});
      return Promise.resolve(new Response(null));
    });
    globalThis.fetch = sahte as unknown as typeof fetch;
    adresiIsit('https://ornek.com/urun/1');
    adresiIsit('https://ornek.com/urun/2');
    expect(sahte).toHaveBeenCalledTimes(1);
    expect(cagrilar[0]?.method).toBe('HEAD');
  });

  test('bozuk adres istek atmaz ve hata fırlatmaz', () => {
    const sahte = mock(() => Promise.resolve(new Response(null)));
    globalThis.fetch = sahte as unknown as typeof fetch;
    expect(() => adresiIsit('bu bir adres değil')).not.toThrow();
    expect(sahte).not.toHaveBeenCalled();
  });

  test('istek başarısız olursa sessiz kalır', () => {
    globalThis.fetch = (() => Promise.reject(new Error('ağ yok'))) as unknown as typeof fetch;
    expect(() => adresiIsit('https://hata.example')).not.toThrow();
  });
});
