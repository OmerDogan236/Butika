// Sol kategori rafının gruplama/sıralama kuralı. Arayüzden bağımsız tutulur:
// ek istek yok, yalnız elde olan kategori listesi istemci tarafında bölünür.
export type RafGrupAnahtari = 'secilen' | 'populer' | 'tumu';

export interface RafGrubu {
  anahtar: RafGrupAnahtari;
  idler: string[];
}

/**
 * Sıra: onboarding'de seçilenler (seçim sırasıyla) → popüler → kalan tüm
 * kategoriler (API sırasıyla). Boş grup hiç döndürülmez; var olmayan ve
 * tekrar eden id'ler yok sayılır.
 */
export function rafGruplari(
  kategoriler: { id: string }[],
  secilenIdler: string[] = [],
  populerIdler: string[] = [],
): RafGrubu[] {
  const mevcut = new Set(kategoriler.map((k) => k.id));
  const kullanilan = new Set<string>();

  const suz = (idler: string[]) => {
    const sonuc: string[] = [];
    for (const id of idler) {
      if (!mevcut.has(id) || kullanilan.has(id)) continue;
      kullanilan.add(id);
      sonuc.push(id);
    }
    return sonuc;
  };

  const secilen = suz(secilenIdler);
  const populer = suz(populerIdler);
  const tumu = kategoriler.map((k) => k.id).filter((id) => !kullanilan.has(id));

  const gruplar: RafGrubu[] = [
    { anahtar: 'secilen', idler: secilen },
    { anahtar: 'populer', idler: populer },
    { anahtar: 'tumu', idler: tumu },
  ];
  return gruplar.filter((g) => g.idler.length > 0);
}

/** Vitrin açılışında hangi kategori aktif olsun: varsa ilk seçilen, yoksa ilk kategori. */
export function ilkAktifKategori(
  kategoriler: { id: string }[],
  secilenIdler: string[] = [],
): string | null {
  const mevcut = new Set(kategoriler.map((k) => k.id));
  const ilkSecilen = secilenIdler.find((id) => mevcut.has(id));
  return ilkSecilen ?? kategoriler[0]?.id ?? null;
}
