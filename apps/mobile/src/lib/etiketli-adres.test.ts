import { expect, test } from 'bun:test';
import { etiketliAdresAl } from './etiketli-adres';

const ADRES = 'https://lujo.com/urun/elbise';
const ETIKETLI = `${ADRES}?utm_source=butika&utm_medium=app&utm_campaign=baglanti&utm_content=abc`;

test('sunucunun verdiği etiketli adres kullanılır', async () => {
  expect(await etiketliAdresAl(ADRES, async () => ({ url: ETIKETLI }))).toBe(ETIKETLI);
});

test('istek hata verirse orijinal adres', async () => {
  expect(
    await etiketliAdresAl(ADRES, async () => {
      throw new Error('ag yok');
    }),
  ).toBe(ADRES);
});

test('süre dolarsa orijinal adres; istek iptal edilir', async () => {
  let iptal = false;
  const basla = Date.now();
  const sonuc = await etiketliAdresAl(
    ADRES,
    (signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          iptal = true;
        });
        setTimeout(() => resolve({ url: ETIKETLI }), 500);
      }),
    30,
  );
  expect(sonuc).toBe(ADRES);
  expect(iptal).toBe(true);
  expect(Date.now() - basla).toBeLessThan(400);
});

test('yanıt web adresi değilse orijinal adres', async () => {
  for (const kotu of [{ url: 'javascript:alert(1)' }, { url: '' }, { url: 42 }, null, {}]) {
    expect(await etiketliAdresAl(ADRES, async () => kotu as never)).toBe(ADRES);
  }
});
