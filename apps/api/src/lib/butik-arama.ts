import {
  type BoutiqueRow,
  ETIKET_IFADELERI,
  KATEGORI_ESANLAMLARI,
  TARZ_IFADELERI,
} from './butikcan-catalog';

// Vitrin arama kutusu: "butik adı, ürün ya da tarz" yazılınca butikleri süzer.
//
// Butikcan'ın ön elemesinden farkı: orada eşleşme az olunca liste popüler
// butiklerle tamamlanır; burada YALNIZ eşleşenler döner ve yazılan her kelime
// butiğin bir yerinde karşılık bulmalıdır ("bohem elbise" → hem bohem hem elbise).
// Ürün kataloğumuz yok; "elbise" gibi ürün kelimeleri kategori adı, eş anlam
// sözlüğü ve butik açıklamasıyla eşleşir.

/**
 * Yalnız harfleri sadeleştirir, noktalamaya dokunmaz: "Nişantaşı" → "nisantasi",
 * "Molène" → "molene". Kullanıcı telefonda ş/ı/ğ ya da è yazmadan arıyor.
 */
export function harfSadelestir(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/\p{M}/gu, ''); // kalan aksanlar: è é â î û ñ …
}

/** Türkçe harfleri sadeleştirir: "Çanta" ile "canta", "İpek" ile "ipek" aynı olur. */
export function sadelestir(s: string): string {
  return harfSadelestir(s)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// harfSadelestir'in veritabanı karşılığı (SQL translate için). İ/I önce i olur; lower()
// İ'yi "i + birleşik nokta"ya çevirebildiği için o nokta (U+0307) da atılır.
export const SQL_HARF_KAYNAK = 'İIıçğöşüâàáäîìíïûùúèéêëôòóõñÇĞÖŞÜÂÀÁÄÎÌÍÏÛÙÚÈÉÊËÔÒÓÕÑ̇';
export const SQL_HARF_HEDEF = 'iiicgosuaaaaiiiiuuueeeeoooonCGOSUAAAAIIIIUUUEEEEOOOON';

// Aramada anlam taşımayan kelimeler (sadeleştirilmiş hâlleriyle).
const DURAK = new Set(['ve', 'ile', 'icin', 'bir', 'gibi', 'olan', 'da', 'de', 'ya', 'the', 'and']);

// Kelime BAŞINDA eşleşme: "elbise" → "elbiseler" evet, "derin" → "deri" hayır.
function kelimeBasiGecer(metin: string, ifade: string): boolean {
  if (!ifade) return false;
  let i = metin.indexOf(ifade);
  while (i !== -1) {
    if (i === 0 || metin[i - 1] === ' ') return true;
    i = metin.indexOf(ifade, i + 1);
  }
  return false;
}

type Kavram = { tur: 'kategori' | 'tarz' | 'etiket'; deger: string };

interface SozlukSatiri {
  ifade: string; // sadeleştirilmiş
  kavram: Kavram;
}

// Butikcan sözlükleri tek listede, sadeleştirilmiş. Uzun ifadeler önce: "gece elbisesi"
// "elbise"den önce yakalanır.
const SOZLUK: SozlukSatiri[] = [
  ...KATEGORI_ESANLAMLARI.flatMap(({ kategori, ifadeler }) =>
    ifadeler.map((i) => ({
      ifade: sadelestir(i),
      kavram: { tur: 'kategori', deger: sadelestir(kategori) } as Kavram,
    })),
  ),
  ...Object.entries(TARZ_IFADELERI).flatMap(([tarz, ifadeler]) =>
    [tarz, ...ifadeler].map((i) => ({
      ifade: sadelestir(i),
      kavram: { tur: 'tarz', deger: tarz } as Kavram,
    })),
  ),
  ...Object.entries(ETIKET_IFADELERI).flatMap(([etiket, ifadeler]) =>
    [etiket, ...ifadeler].map((i) => ({
      ifade: sadelestir(i),
      kavram: { tur: 'etiket', deger: etiket } as Kavram,
    })),
  ),
].sort((a, b) => b.ifade.length - a.ifade.length);

/** Aramadaki bir şart: kelime(ler) ve o kelimelerin karşılık geldiği kavramlar. */
export interface Sart {
  kelimeler: string[];
  kavramlar: Kavram[];
}

/** Sorguyu şartlara böler. Çok kelimeli sözlük ifadeleri ("gece elbisesi") tek şart olur. */
export function sartlaraBol(sorgu: string): Sart[] {
  let kalan = ` ${sadelestir(sorgu)} `;
  const sartlar: Sart[] = [];
  for (const s of SOZLUK) {
    if (!s.ifade.includes(' ')) continue;
    // Sorguda ifadenin kelime başından geçmesi yeter ("gece elbiseleri").
    const i = kalan.indexOf(` ${s.ifade}`);
    if (i === -1) continue;
    const son = kalan.indexOf(' ', i + 1 + s.ifade.length);
    const parca = kalan.slice(i + 1, son).trim();
    sartlar.push({ kelimeler: parca.split(' '), kavramlar: tumKavramlar(s.ifade) });
    kalan = `${kalan.slice(0, i)} ${kalan.slice(son)}`;
  }
  for (const k of kalan.split(' ')) {
    if (k.length < 2 || DURAK.has(k)) continue;
    if (sartlar.some((s) => s.kelimeler.length === 1 && s.kelimeler[0] === k)) continue;
    sartlar.push({ kelimeler: [k], kavramlar: tumKavramlar(k) });
  }
  return sartlar;
}

// Bir ifadenin sözlükteki bütün karşılıkları. "serum" hem güzellik kategorisi hem
// "etkin bakım" etiketi. Tek kelimede ifade kelimenin başı olmalı: "elbisesi" →
// "elbise" (giyim) evet, "ele" → "elbise" hayır (kısa kelimeler kavrama gitmez).
function tumKavramlar(ifade: string): Kavram[] {
  const out: Kavram[] = [];
  const ekle = (k: Kavram) => {
    if (!out.some((o) => o.tur === k.tur && o.deger === k.deger)) out.push(k);
  };
  for (const s of SOZLUK) {
    if (s.ifade === ifade || (ifade.length >= 4 && ifade.startsWith(s.ifade))) ekle(s.kavram);
  }
  return out;
}

interface HazirSatir {
  r: BoutiqueRow;
  ad: string;
  kategoriler: string;
  kategoriListesi: string[];
  aciklama: string;
  tarzlar: string[];
  etiketler: string[];
}

function hazirla(r: BoutiqueRow): HazirSatir {
  return {
    r,
    ad: sadelestir(r.name),
    kategoriler: sadelestir(r.categoryNames ?? ''),
    kategoriListesi: (r.categoryNames ?? '').split(',').map(sadelestir),
    aciklama: sadelestir(r.description ?? ''),
    tarzlar: [r.tarz1, r.tarz2].filter((t): t is string => Boolean(t)),
    etiketler: r.etiketler ?? [],
  };
}

// Bir şartın butikteki en güçlü karşılığı; 0 = karşılık yok.
// Ad > tarz > kategori/etiket > açıklama.
function sartPuani(h: HazirSatir, s: Sart): number {
  const metin = s.kelimeler.join(' ');
  let p = 0;
  if (kelimeBasiGecer(h.ad, metin)) p = Math.max(p, 10);
  for (const k of s.kavramlar) {
    if (k.tur === 'tarz') {
      if (h.tarzlar[0] === k.deger) p = Math.max(p, 7);
      else if (h.tarzlar[1] === k.deger) p = Math.max(p, 5);
    } else if (k.tur === 'kategori') {
      // Kategori ADININ başı: "giyim" kavramı "Giyim"e uyar, "İç Giyim"e uymaz.
      if (h.kategoriListesi.some((c) => c.startsWith(k.deger))) p = Math.max(p, 6);
    } else if (h.etiketler.includes(k.deger)) {
      p = Math.max(p, 6);
    }
  }
  if (kelimeBasiGecer(h.kategoriler, metin)) p = Math.max(p, 6);
  if (h.tarzlar.some((t) => kelimeBasiGecer(sadelestir(t), metin))) p = Math.max(p, 7);
  if (kelimeBasiGecer(h.aciklama, metin)) p = Math.max(p, 2);
  return p;
}

export interface AramaSecenekleri {
  kategoriId?: string;
  limit?: number;
}

/**
 * Havuzu sorguya göre süzer ve sıralar.
 * - Havuzda hiçbir butikte karşılığı olmayan kelimeler yok sayılır: "kahverengi çanta"
 *   → çanta butikleri (renk, beden gibi kelimeler için ürün kataloğumuz yok).
 * - Kalan her şart karşılık bulmalı (VE). Bu kimseyi getirmezse sonuç boş kalmaz:
 *   şartlardan en az birine uyanlar, en çok şarta uyandan başlayarak döner (sahip, 18 Eki).
 * Sıra: puan (ad tam eşleşmesi en üstte), eşitlikte admin elle sırası.
 */
export function butikAra(
  havuz: BoutiqueRow[],
  sorgu: string,
  secenek: AramaSecenekleri = {},
): BoutiqueRow[] {
  const tumSartlar = sartlaraBol(sorgu);
  if (tumSartlar.length === 0) return [];
  const tumSorgu = sadelestir(sorgu);
  const hazir = havuz
    .filter((r) => !secenek.kategoriId || (r.categoryIds ?? []).includes(secenek.kategoriId))
    .map(hazirla);
  const puanlar = hazir.map((h) => tumSartlar.map((s) => sartPuani(h, s)));
  const gecerli = tumSartlar.map((_, i) => puanlar.some((p) => (p[i] ?? 0) > 0));
  const sayi = gecerli.filter(Boolean).length;

  const tam: { r: BoutiqueRow; puan: number }[] = [];
  const kismi: { r: BoutiqueRow; puan: number; uyan: number }[] = [];
  hazir.forEach((h, j) => {
    const p = (puanlar[j] ?? []).filter((_, i) => gecerli[i]);
    const uyan = p.filter((x) => x > 0).length;
    const puan = p.reduce((t, x) => t + x, 0);
    // Butik adı boşluklu/boşluksuz yazılmış olabilir ("lujo studio" / "lujostudio").
    const adBitisik =
      tumSorgu.length >= 2 && h.ad.replace(/ /g, '').startsWith(tumSorgu.replace(/ /g, ''));
    if (sayi > 0 && uyan === sayi) {
      let ek = 0;
      if (h.ad === tumSorgu) ek = 100;
      else if (h.ad.startsWith(tumSorgu)) ek = 30;
      tam.push({ r: h.r, puan: puan + ek });
    } else if (adBitisik) {
      tam.push({ r: h.r, puan: 100 });
    } else if (uyan > 0) {
      kismi.push({ r: h.r, puan, uyan });
    }
  });

  const limit = secenek.limit ?? 100;
  if (tam.length > 0) {
    tam.sort((a, b) => b.puan - a.puan || a.r.sortOrder - b.r.sortOrder);
    return tam.slice(0, limit).map((s) => s.r);
  }
  kismi.sort((a, b) => b.uyan - a.uyan || b.puan - a.puan || a.r.sortOrder - b.r.sortOrder);
  return kismi.slice(0, limit).map((s) => s.r);
}
