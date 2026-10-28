import type { BulguTuru, HamBulgu, Onem, Ozet } from './siniflandir';

export type OncekiDurum = {
  sonAlanAdi: string | null;
  sonParaBirimi: string | null;
  sonBaslik: string | null;
  ardisikAcilmama: number;
  yoksay: Record<string, string>;
} | null;

export interface TurBulgusu {
  tur: BulguTuru;
  onem: Onem;
  yeni: boolean;
  kanit: string;
  oncekiDeger: string | null;
  simdikiDeger: string | null;
}

export const ONEM: Record<BulguTuru, Onem> = {
  acilmiyor: 'orta', // dinamik: ardışık 2. haftadan itibaren yüksek
  park_satilik: 'yuksek',
  magaza_kapali: 'yuksek',
  baska_alan_adi: 'yuksek',
  para_birimi: 'orta',
  marka_uyusmuyor: 'orta',
  moda_disi: 'dusuk',
  elle_bak: 'bilgi',
};

const ACILMIYOR_YUKSEK_ESIK = 2;

export function karsilastir(
  onceki: OncekiDurum,
  ham: HamBulgu[],
  ozet: Ozet,
  oncekiBulgular: Map<BulguTuru, string | null>,
): {
  bulgular: TurBulgusu[];
  yeniDurum: Omit<NonNullable<OncekiDurum>, 'yoksay'> & { yoksay: Record<string, string> };
} {
  const yoksay = onceki?.yoksay ?? {};
  const oncekiSayac = onceki?.ardisikAcilmama ?? 0;
  const oncekiDegerler: Partial<Record<BulguTuru, string | null>> = {
    para_birimi: onceki?.sonParaBirimi ?? null,
    baska_alan_adi: onceki?.sonAlanAdi ?? null,
    marka_uyusmuyor: onceki?.sonBaslik ?? null,
  };
  const simdikiDegerler: Partial<Record<BulguTuru, string | null>> = {
    para_birimi: ozet.paraBirimi,
    baska_alan_adi: ozet.kokAlanAdi,
    marka_uyusmuyor: ozet.baslik,
  };

  const bulgular: TurBulgusu[] = [];
  for (const h of ham) {
    const simdikiDeger = (simdikiDegerler[h.tur] ?? h.deger) || null;
    // Yoksayma, kayıtlı (normalleştirilmiş) değerle karşılaştırılır; null '' sayılır
    if (yoksay[h.tur] !== undefined && yoksay[h.tur] === (simdikiDeger ?? '')) continue;
    const onem: Onem =
      h.tur === 'acilmiyor'
        ? oncekiSayac + 1 >= ACILMIYOR_YUKSEK_ESIK
          ? 'yuksek'
          : 'orta'
        : ONEM[h.tur];
    bulgular.push({
      tur: h.tur,
      onem,
      yeni: !oncekiBulgular.has(h.tur) || (oncekiBulgular.get(h.tur) ?? null) !== simdikiDeger,
      kanit: h.kanit,
      oncekiDeger: oncekiDegerler[h.tur] ?? null,
      simdikiDeger,
    });
  }

  const acilmiyorVar = ham.some((h) => h.tur === 'acilmiyor');
  const elleBakVar = ham.some((h) => h.tur === 'elle_bak');
  let ardisikAcilmama = oncekiSayac;
  if (acilmiyorVar) ardisikAcilmama = oncekiSayac + 1;
  // magaza_kapali/park_satilik (acildi=false, acilmiyor yok) sayaci degistirmez
  else if (ozet.acildi && !elleBakVar) ardisikAcilmama = 0;

  // Açılmadıysa ya da özet alanı boşsa (zaman aşımı, bot koruması) önceki değer korunur
  const al = (yeni: string | null, eski: string | null) => (ozet.acildi ? (yeni ?? eski) : eski);
  return {
    bulgular,
    yeniDurum: {
      sonAlanAdi: al(ozet.kokAlanAdi, onceki?.sonAlanAdi ?? null),
      sonParaBirimi: al(ozet.paraBirimi, onceki?.sonParaBirimi ?? null),
      sonBaslik: al(ozet.baslik, onceki?.sonBaslik ?? null),
      ardisikAcilmama,
      yoksay: { ...yoksay },
    },
  };
}
