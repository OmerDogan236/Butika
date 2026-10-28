// Butik kartı gösterimi (boutique_impression): bir kart listede yeterince uzun süre ekranda
// kaldığında bir kez sayılır. Tıklama (boutique_view, list_position) ile birlikte "görülen →
// tıklanan" oranı her butik ve her sıra için çıkar.
//
// Aynı liste bağlamında (ör. vitrinde aynı kategori + sıralama) bir butik yalnız bir kez sayılır;
// bağlam değişince (kategori, sıralama, arama metni) sayım yeniden başlar.
// Ortak özellikler henüz hazır değilse (arama daha sayılmadı, search_id yok) görülen kartlar
// bekletilir; hazır olunca gönderilir, bağlam değişirse düşer.

export type Gorunen = { id: string; sira: number };
type Ortak = Record<string, unknown>;

export class GosterimOlcer {
  private anahtar: string | null = null;
  private ortak: Ortak | null = null;
  private sayilan = new Set<string>();
  private bekleyen = new Map<string, number>();

  constructor(
    private readonly liste: string,
    private readonly kaydet: (yuk: Record<string, unknown>) => void,
  ) {}

  /** Listenin şu anki bağlamı. ortak null: kartlar görülür ama ortak bilgi gelene kadar bekler. */
  baglam(anahtar: string, ortak: Ortak | null) {
    if (anahtar !== this.anahtar) {
      this.anahtar = anahtar;
      this.sayilan = new Set();
      this.bekleyen = new Map();
    }
    this.ortak = ortak;
    if (!ortak || this.bekleyen.size === 0) return;
    const bekleyen = this.bekleyen;
    this.bekleyen = new Map();
    for (const [id, sira] of bekleyen) this.say(id, sira);
  }

  /** Ekranda yeterince uzun kalan kartlar (FlatList onViewableItemsChanged). */
  gorundu(kartlar: Gorunen[]) {
    if (this.anahtar === null) return;
    for (const k of kartlar) {
      if (this.sayilan.has(k.id)) continue;
      if (this.ortak) this.say(k.id, k.sira);
      else if (!this.bekleyen.has(k.id)) this.bekleyen.set(k.id, k.sira);
    }
  }

  private say(id: string, sira: number) {
    if (this.sayilan.has(id)) return;
    this.sayilan.add(id);
    this.kaydet({ boutique_id: id, list: this.liste, list_position: sira, ...this.ortak });
  }
}
