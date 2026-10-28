// Arama ölçümü: yazarken sonuçlar canlı gelir (her tuştan ~0,3 sn sonra), ama her harf ayrı
// arama sayılmaz. Bir arama ancak şu durumlarda tek kayıt olarak gider:
//   - kullanıcı yazmayı bırakıp sonuçlar BEKLEME_MS boyunca ekranda kaldıysa,
//   - klavyede "Ara"ya bastıysa,
//   - bir sonuca dokunduysa (dokunuştan hemen önce).
// Aynı metin üst üste iki kez sayılmaz (metin değişip geri yazılırsa yeni arama sayılır). Her aramanın bir search_id'si olur; sonuca dokunma
// olayı (search_result_click) bu kimlikle aramaya bağlanır.

export const BEKLEME_MS = 1500;

export type AramaOlcumKaydi = {
  searchId: string;
  query: string;
  resultsCount: number;
  mode: string;
};

type Bekleyen = { anahtar: string; query: string; resultsCount: number; mode: string };
type Zamanlayici = (fn: () => void, ms: number) => () => void;

export class AramaOlcer {
  private bekleyen: Bekleyen | null = null;
  private iptal: (() => void) | null = null;
  private sonAnahtar: string | null = null;
  private son: AramaOlcumKaydi | null = null;
  private dinleyiciler = new Set<(k: AramaOlcumKaydi | null) => void>();

  constructor(
    private readonly kaydet: (k: AramaOlcumKaydi) => void,
    private readonly kimlikUret: () => string,
    private readonly zamanla: Zamanlayici = (fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
  ) {}

  /** Bu metnin sonuçları ekranda (resultsCount = gösterilen sonuç sayısı). */
  sonuclarGeldi(query: string, resultsCount: number, mode = 'canli') {
    const q = query.trim();
    if (!q) return;
    this.temizle();
    const anahtar = `${mode}:${q.toLocaleLowerCase('tr')}`;
    // Ekrandaki sonuçlar artık önceki aramanın değil: dokunuş ona bağlanmasın.
    if (anahtar !== this.sonAnahtar) this.sonuAyarla(null);
    this.bekleyen = { anahtar, query: q, resultsCount, mode };
    this.iptal = this.zamanla(() => this.gonder(), BEKLEME_MS);
  }

  /** Metin değişti ya da silindi: bekleyen arama sayılmadan düşer. Aynı metin sonra yeniden
   * yazılırsa yeni bir arama sayılır. */
  vazgec() {
    this.temizle();
    this.sonAnahtar = null;
    this.sonuAyarla(null);
  }

  /** Bekleyeni hemen kaydeder; ekrandaki aramanın kaydını döndürür (yoksa null). */
  gonder(): AramaOlcumKaydi | null {
    const b = this.bekleyen;
    this.temizle();
    if (b && b.anahtar !== this.sonAnahtar) {
      this.sonAnahtar = b.anahtar;
      const kayit = {
        searchId: this.kimlikUret(),
        query: b.query,
        resultsCount: b.resultsCount,
        mode: b.mode,
      };
      this.kaydet(kayit);
      this.sonuAyarla(kayit);
    }
    return this.son;
  }

  /** Ekrandaki aramanın kaydı değişince haber verir (gösterim ölçümü search_id'yi buradan alır). */
  dinle(fn: (k: AramaOlcumKaydi | null) => void): () => void {
    this.dinleyiciler.add(fn);
    return () => this.dinleyiciler.delete(fn);
  }

  private sonuAyarla(k: AramaOlcumKaydi | null) {
    if (k === this.son) return;
    this.son = k;
    for (const fn of this.dinleyiciler) fn(k);
  }

  private temizle() {
    this.iptal?.();
    this.iptal = null;
    this.bekleyen = null;
  }
}

export function aramaYuku(k: AramaOlcumKaydi, target: string): Record<string, unknown> {
  return {
    query: k.query,
    target,
    search_id: k.searchId,
    search_mode: k.mode,
    results_count: k.resultsCount,
    is_zero_result: k.resultsCount === 0,
  };
}
