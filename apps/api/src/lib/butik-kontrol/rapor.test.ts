import { expect, test } from 'bun:test';
import { epostaIcerigi, haftaAnahtari, raporMetni } from './rapor';

test('sorunsuz hafta', () =>
  expect(raporMetni({ kontrolEdilen: 684, sayilar: {} })).toBe(
    'Bu hafta 684 butik kontrol edildi, yeni sorun yok.',
  ));

test('örnek cümle', () => {
  expect(
    raporMetni({
      kontrolEdilen: 684,
      sayilar: {
        acilmiyor: { toplam: 2, yuksek: 2 },
        baska_alan_adi: { toplam: 1, yuksek: 1 },
        para_birimi: { toplam: 1, yuksek: 0 },
        elle_bak: { toplam: 3, yuksek: 0 },
      },
    }),
  ).toBe(
    'Bu hafta 684 butik kontrol edildi. 2 site ikinci haftadır açılmıyor, 1 butik başka bir alan adına yönleniyor, 1 butik farklı para birimi gösteriyor. 3 site otomatik kontrolü engelliyor, elle bakılmalı.',
  );
});

test('açılmıyor orta önem ayrı cümle', () => {
  expect(raporMetni({ kontrolEdilen: 10, sayilar: { acilmiyor: { toplam: 3, yuksek: 1 } } })).toBe(
    'Bu hafta 10 butik kontrol edildi. 1 site ikinci haftadır açılmıyor, 2 site bu hafta açılmadı (tekrar bakılacak).',
  );
});

test('yalnız elle_bak', () => {
  expect(raporMetni({ kontrolEdilen: 10, sayilar: { elle_bak: { toplam: 1, yuksek: 0 } } })).toBe(
    'Bu hafta 10 butik kontrol edildi. 1 site otomatik kontrolü engelliyor, elle bakılmalı.',
  );
});

test('hafta anahtarı İstanbul saatine göre', () => {
  expect(haftaAnahtari(new Date('2026-10-04T20:30:00Z'))).toBe('2026-W40');
  expect(haftaAnahtari(new Date('2026-10-04T21:30:00Z'))).toBe('2026-W41');
});

test('e-posta içeriği bağlantı ve bulgular içerir', () => {
  const e = epostaIcerigi(
    'Bu hafta 5 butik kontrol edildi.',
    [{ ad: 'Lamu', tur: 'park_satilik', kanit: '/lander' }],
    'https://admin.butika.ai/butik-kontrol',
  );
  expect(e.subject).toContain('Butik kontrolü');
  expect(e.text).toContain('Lamu');
  expect(e.html).toContain('https://admin.butika.ai/butik-kontrol');
});

test('e-posta HTML kaçırılır, en çok 10 madde', () => {
  const liste = Array.from({ length: 15 }, (_, i) => ({
    ad: i === 0 ? '<b>X&Y</b>' : `B${i}`,
    tur: 'elle_bak' as const,
    kanit: '<script>',
  }));
  const e = epostaIcerigi('ozet', liste, 'https://a.b/c');
  expect(e.html).toContain('&lt;b&gt;X&amp;Y&lt;/b&gt;');
  expect(e.html).not.toContain('<script>');
  expect((e.html.match(/<li/g) ?? []).length).toBe(10);
});
