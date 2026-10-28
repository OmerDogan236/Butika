import { describe, expect, test } from 'bun:test';
import { ilkBasarili } from './gemini';

const bekle = <T>(ms: number, deger: T, hata = false) =>
  new Promise<T>((res, rej) =>
    setTimeout(() => (hata ? rej(new Error(String(deger))) : res(deger)), ms),
  );

describe('ilkBasarili', () => {
  test('ilk deneme hızlıysa ikinci başlamaz', async () => {
    let n = 0;
    expect(await ilkBasarili(() => (n++, bekle(10, 'a')), 50, 500)).toBe('a');
    await bekle(80, null);
    expect(n).toBe(1);
  });
  test('ilk takılırsa ikinci deneme kazanır', async () => {
    let n = 0;
    const t = Date.now();
    const r = await ilkBasarili(
      () => (++n === 1 ? bekle(1000, 'yavas') : bekle(10, 'hizli')),
      50,
      500,
    );
    expect(r).toBe('hizli');
    expect(Date.now() - t).toBeLessThan(200);
  });
  test('ilk hata verirse ikinci hemen başlar', async () => {
    let n = 0;
    const r = await ilkBasarili(
      () => (++n === 1 ? bekle(5, 'x', true) : bekle(5, 'ok')),
      1000,
      2000,
    );
    expect(r).toBe('ok');
  });
  test('ikisi de hata verirse son hata', async () => {
    await expect(ilkBasarili(() => bekle(5, 'bozuk', true), 1000, 2000)).rejects.toThrow('bozuk');
  });
  test('ikinci hata verse de ilk hâlâ sürüyorsa onu bekler', async () => {
    let n = 0;
    const r = await ilkBasarili(
      () => (++n === 1 ? bekle(100, 'ilk') : bekle(5, 'x', true)),
      20,
      500,
    );
    expect(r).toBe('ilk');
  });
  test('deneme numarası verilir: 0 sonra 1', async () => {
    const nolar: number[] = [];
    await ilkBasarili(
      (no) => (nolar.push(no), no === 0 ? bekle(5, 'x', true) : bekle(5, 'ok')),
      1000,
      2000,
    );
    expect(nolar).toEqual([0, 1]);
  });
  test('toplam süre aşılırsa gemini_timeout', async () => {
    await expect(ilkBasarili(() => bekle(1000, 'a'), 20, 80)).rejects.toThrow('gemini_timeout');
  });
});
