// Butik sayfasına nereden gelindiğini taşır; boutique_view olayına eklenir ki
// kişisel sıralamanın işe yarayıp yaramadığı ölçülebilsin.
import type { Siralama } from '../api/queries';

export const BUTIK_KAYNAKLARI = [
  'vitrin',
  'secki',
  'firsat',
  'butikcan',
  'arama',
  'oneri',
  'bildirim',
  'link',
  'kayitli',
] as const;
export type ButikKaynagi = (typeof BUTIK_KAYNAKLARI)[number];

// Record<Siralama, …>: vitrine yeni bir sıralama eklenir ya da biri kalkarsa tip denetimi burada durur.
const SIRALAMA_TABLOSU: Record<Siralama, true> = {
  onerilen: true,
  uygun_once: true,
  luks_once: true,
  kisisel: true,
  alfabetik: true,
};
const SIRALAMALAR: string[] = Object.keys(SIRALAMA_TABLOSU);

/** sira: butiğin geldiği listedeki 1-tabanlı yeri; listeden gelinmiyorsa verilmez. */
export function butikYolu(id: string, kaynak: ButikKaynagi, siralama?: string, sira?: number) {
  return {
    pathname: '/boutique/[id]' as const,
    params: {
      id,
      kaynak,
      ...(siralama ? { siralama } : {}),
      ...(sira !== undefined ? { sira: String(sira) } : {}),
    },
  };
}

/** Yol parametresindeki sıra; pozitif tam sayı değilse null. */
export function siraOku(sira: string | undefined): number | null {
  if (!sira || !/^\d{1,4}$/.test(sira)) return null;
  const n = Number(sira);
  return n >= 1 ? n : null;
}

/** Yol parametresindeki kaynak; bilinmeyen değer null. */
export function kaynakOku(kaynak: string | undefined): ButikKaynagi | null {
  return kaynak && (BUTIK_KAYNAKLARI as readonly string[]).includes(kaynak)
    ? (kaynak as ButikKaynagi)
    : null;
}

// boutiqueId/kaynak/siralama: sunucu (profil, admin panosu) ve geçmiş veri bu adlara bağlı, kalır.
// boutique_id/entry_source/list_position: PostHog'daki öbür olaylarla aynı adlar (18 Eki 2026).
export function butikAcmaYuku(
  boutiqueId: string,
  kaynak: string | undefined,
  siralama: string | undefined,
  sira?: string,
): Record<string, string | number> {
  const yuk: Record<string, string | number> = { boutiqueId, boutique_id: boutiqueId };
  const gecerliKaynak = kaynakOku(kaynak);
  if (gecerliKaynak) {
    yuk.kaynak = gecerliKaynak;
    yuk.entry_source = gecerliKaynak;
  }
  if (siralama && SIRALAMALAR.includes(siralama)) yuk.siralama = siralama;
  const gecerliSira = siraOku(sira);
  if (gecerliSira !== null) yuk.list_position = gecerliSira;
  return yuk;
}
