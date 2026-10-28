// Butiğin sitesine giden ilk adrese Butika'nın izleme parametreleri eklenir:
//   utm_source=butika, utm_medium=app, utm_campaign=<kaynak ekran>, butika_click=<tıklama kimliği>
// Butik kendi analitiğinde (Google Analytics, Shopify, ikas) Butika'dan gelen trafiği bu
// parametrelerle görür; butika_click, boutique_outbound_click olayındaki click_id ile aynıdır.
// Kullanıcı sitede gezinirken adres çubuğundan okunan adreslerden bu parametreler temizlenir:
// kaydedilen ürün, yorum ve paylaşım adresi parametresiz kalır, fiyat takibi aynı ürünü iki kez saymaz.
// (Elle yazıldı: React Native'in URLSearchParams'ı set/delete desteklemiyor.)

// utm_content: bağlı butiklerde sunucunun verdiği etiketli linkteki gönderim kimliği (POST /gonderimler).
const BIZIM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'butika_click'] as const;

function parcala(url: string): { govde: string; sorgu: string[]; parca: string } {
  const diyez = url.indexOf('#');
  const parca = diyez >= 0 ? url.slice(diyez) : '';
  const onu = diyez >= 0 ? url.slice(0, diyez) : url;
  const soru = onu.indexOf('?');
  if (soru < 0) return { govde: onu, sorgu: [], parca };
  return {
    govde: onu.slice(0, soru),
    sorgu: onu
      .slice(soru + 1)
      .split('&')
      .filter((p) => p.length > 0),
    parca,
  };
}

const ad = (p: string) => p.split('=')[0] ?? '';
const deger = (sorgu: string[], anahtar: string) => {
  const p = sorgu.find((x) => ad(x) === anahtar);
  return p === undefined ? null : (p.split('=')[1] ?? '');
};

function birlestir(govde: string, sorgu: string[], parca: string) {
  return `${govde}${sorgu.length ? `?${sorgu.join('&')}` : ''}${parca}`;
}

// Bilinmeyen parametreyle bozulduğu görülen butik siteleri (alan adı, www'siz). Buradakilere
// hiçbir parametre eklenmez. Şimdilik boş; bozulan site çıkarsa eklenir (yeni sürüm ister).
const IZSIZ_ALANLAR = new Set<string>();

function alanAdi(govde: string): string {
  const m = /^https?:\/\/([^/:]+)/i.exec(govde);
  return (m?.[1] ?? '').toLowerCase().replace(/^www\./, '');
}

/**
 * İlk açılış adresine izleme parametrelerini ekler. Adreste zaten bir utm_ değeri varsa
 * (butiğin ya da bir kampanyanın kendi etiketi) onlara dokunulmaz, yalnız butika_click eklenir.
 */
export function izliAdres(url: string, kampanya: string, tiklamaKimligi: string): string {
  const { govde, sorgu, parca } = parcala(url);
  if (IZSIZ_ALANLAR.has(alanAdi(govde))) return url;
  const kalan = sorgu.filter((p) => ad(p) !== 'butika_click');
  const utmVar = kalan.some((p) => ad(p).startsWith('utm_'));
  const ekle = [
    ...(utmVar
      ? []
      : ['utm_source=butika', 'utm_medium=app', `utm_campaign=${encodeURIComponent(kampanya)}`]),
    `butika_click=${encodeURIComponent(tiklamaKimligi)}`,
  ];
  return birlestir(govde, [...kalan, ...ekle], parca);
}

/**
 * Adresten Butika'nın eklediklerini çıkarır: butika_click her zaman, utm_* yalnız
 * utm_source=butika ise. Butiğin kendi utm'leri olduğu gibi kalır.
 */
export function izleriTemizle(url: string): string {
  const { govde, sorgu, parca } = parcala(url);
  const bizimUtm = deger(sorgu, 'utm_source') === 'butika';
  const kalan = sorgu.filter(
    (p) => ad(p) !== 'butika_click' && !(bizimUtm && (BIZIM as readonly string[]).includes(ad(p))),
  );
  return kalan.length === sorgu.length ? url : birlestir(govde, kalan, parca);
}
