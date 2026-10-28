import { expect, test } from 'bun:test';
import { izleriTemizle, izliAdres } from './butik-linki';

const K = '3f2b';

test('parametresiz adrese eklenir', () => {
  expect(izliAdres('https://ornek.com', 'vitrin', K)).toBe(
    `https://ornek.com?utm_source=butika&utm_medium=app&utm_campaign=vitrin&butika_click=${K}`,
  );
});

test('var olan sorgu ve # korunur', () => {
  expect(izliAdres('https://ornek.com/urun?renk=mavi#yorumlar', 'arama', K)).toBe(
    `https://ornek.com/urun?renk=mavi&utm_source=butika&utm_medium=app&utm_campaign=arama&butika_click=${K}#yorumlar`,
  );
});

test('adreste zaten utm varsa üzerine yazılmaz, yalnız butika_click eklenir', () => {
  expect(izliAdres('https://ornek.com/?utm_source=ig&utm_campaign=ekim', 'vitrin', K)).toBe(
    `https://ornek.com/?utm_source=ig&utm_campaign=ekim&butika_click=${K}`,
  );
});

test('temizleme: izli adres eski haline döner', () => {
  for (const url of [
    'https://ornek.com',
    'https://ornek.com/',
    'https://ornek.com/urun?renk=mavi',
    'https://ornek.com/urun?renk=mavi#a',
    'https://ornek.com/?utm_source=ig&utm_campaign=ekim',
  ]) {
    expect(izleriTemizle(izliAdres(url, 'secki', K))).toBe(url);
  }
});

test('temizleme: site yönlendirmede parametre sırasını değiştirse de çıkar', () => {
  expect(
    izleriTemizle(
      'https://ornek.com/?butika_click=x&variant=12&utm_campaign=vitrin&utm_medium=app&utm_source=butika',
    ),
  ).toBe('https://ornek.com/?variant=12');
});

test('temizleme: butiğin kendi utm değerlerine dokunulmaz', () => {
  const url = 'https://ornek.com/urun?utm_source=instagram&utm_campaign=ekim';
  expect(izleriTemizle(url)).toBe(url);
});

test('temizleme: bağlantı etiketi (utm_content) de çıkar, paylaşılan adreste gönderim kimliği kalmaz', () => {
  expect(
    izleriTemizle(
      'https://lujo.com/urun?renk=mavi&utm_source=butika&utm_medium=app&utm_campaign=baglanti&utm_content=0b6c2f4e-1111-4222-8333-444455556666#a',
    ),
  ).toBe('https://lujo.com/urun?renk=mavi#a');
});

test('temizleme: başka kaynağın utm_content değerine dokunulmaz', () => {
  const url = 'https://ornek.com/urun?utm_source=instagram&utm_content=hikaye';
  expect(izleriTemizle(url)).toBe(url);
});
