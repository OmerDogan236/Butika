// Butik sitesinin alan adı çözümlemesini ve güvenli bağlantısını önceden hazırlar.
// Kullanıcı butik sayfasını açtığı anda tetiklenir; uygulama içi tarayıcı birkaç saniye
// sonra aynı adrese gittiğinde bu adımlar hazır olur.
//
// Kasıtlı olarak küçük tutuldu: yalnız HEAD isteği, kısa zaman aşımı, hata yutulur ve
// aynı alan adı bir kez ısıtılır (kullanıcı ileri geri gezerken tekrar istek atılmasın).
const isitilanlar = new Set<string>();
const ZAMAN_ASIMI_MS = 4000;

export function adresiIsit(url: string): void {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return;
  }
  if (!host || isitilanlar.has(host)) return;
  isitilanlar.add(host);
  // NOT: AbortSignal.timeout React Native'de yok (Hermes) — AbortController + setTimeout.
  try {
    const kontrol = new AbortController();
    const zamanlayici = setTimeout(() => kontrol.abort(), ZAMAN_ASIMI_MS);
    fetch(url, { method: 'HEAD', signal: kontrol.signal })
      .catch(() => {
        // Site HEAD'i reddedebilir ya da yavaş olabilir; ısıtma başarısızsa sorun değil.
      })
      .finally(() => clearTimeout(zamanlayici));
  } catch {
    // Isıtma hiçbir koşulda ekranı düşürmemeli.
  }
}

/** Testler için: ısıtma hafızasını temizler. */
export function isitmaHafizasiniTemizle(): void {
  isitilanlar.clear();
}
