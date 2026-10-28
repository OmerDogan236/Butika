// Kategori kapak çizimleri. API'de kategori görseli olmadığı için slug'a göre
// uygulamayla birlikte gelir. Listede olmayan (yeni eklenen) kategori görselsiz
// kalır; kart düz `mist` zeminle görünür.
const CATEGORY_ART: Record<string, number> = {
  abiye: require('../../assets/categories/abiye.jpg'),
  plaj: require('../../assets/categories/plaj.jpg'),
  gunlukgiyim: require('../../assets/categories/gunlukgiyim.jpg'),
  aksesuar: require('../../assets/categories/aksesuar.jpg'),
  guzellik: require('../../assets/categories/guzellik.jpg'),
  mucevher: require('../../assets/categories/mucevher.jpg'),
  sporgiyim: require('../../assets/categories/sporgiyim.jpg'),
  'hamile-giyim': require('../../assets/categories/hamile-giyim.jpg'),
  icgiyim: require('../../assets/categories/icgiyim.jpg'),
  esarp: require('../../assets/categories/esarp.jpg'),
  tesettur: require('../../assets/categories/tesettur.jpg'),
  buyukbeden: require('../../assets/categories/buyukbeden.jpg'),
  canta: require('../../assets/categories/canta.jpg'),
  hediyelik: require('../../assets/categories/hediyelik.jpg'),
  kidscorner: require('../../assets/categories/kidscorner.jpg'),
  parfumkoku: require('../../assets/categories/parfumkoku.jpg'),
  bastancikar: require('../../assets/categories/bastancikar.jpg'),
  deri: require('../../assets/categories/deri.jpg'),
  sikevgiyimi: require('../../assets/categories/sikevgiyimi.jpg'),
  organikbebekgiyim: require('../../assets/categories/organikbebekgiyim.jpg'),
  ayakkabi: require('../../assets/categories/ayakkabi.jpg'),
  kiralik: require('../../assets/categories/kiralik.jpg'),
  bridal: require('../../assets/categories/bridal.jpg'),
  kayak: require('../../assets/categories/kayak.jpg'),
  tasarimcilar: require('../../assets/categories/tasarimcilar.jpg'),
};

export function categoryArt(slug: string): number | undefined {
  return CATEGORY_ART[slug];
}
