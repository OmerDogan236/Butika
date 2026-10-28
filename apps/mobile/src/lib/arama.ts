// Vitrin arama kutusu: "Ara" tuşunda Butikcan'ın anlayışına başvurulup başvurulmayacağı.

/** Boşluklara göre kelime sayısı (baştaki/sondaki boşluk sayılmaz). */
export function kelimeSayisi(q: string): number {
  const t = q.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

/** 3 ya da daha fazla kelime = cümle; Butikcan'a sorulur. */
export function butikcanAramasiMi(q: string): boolean {
  return kelimeSayisi(q) >= 3;
}
