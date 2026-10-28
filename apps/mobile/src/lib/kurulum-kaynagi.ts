// Kurulum kaynağı (uygulamayı ilk nereden indirdi). Android'de Play Store, mağaza linkindeki
// referrer'ı (ör. butika.ai/indir?utm_source=instagram → Play linkine referrer=utm_source%3Dinstagram)
// kurulumdan sonra uygulamaya verir. iOS'ta Apple kişi bazında bu bilgiyi vermez; orada
// onboarding'deki "Butika'yı nereden duydun?" cevabı (heard_from) kullanılır.
// Kişi özellikleri $set_once ile bir kez yazılır, sonra ezilmez.

const UTM = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/** Play referrer metninden utm değerleri. Metin bir kez daha kodlanmış gelebilir (%3D, %26). */
export function referrerUtm(referrer: string): Partial<Record<(typeof UTM)[number], string>> {
  let metin = referrer.trim();
  if (!metin.includes('=') && /%3D/i.test(metin)) {
    try {
      metin = decodeURIComponent(metin);
    } catch {
      return {};
    }
  }
  const sonuc: Partial<Record<(typeof UTM)[number], string>> = {};
  for (const parca of metin.split('&')) {
    const [ad, deger = ''] = parca.split('=');
    if (!(UTM as readonly string[]).includes(ad ?? '')) continue;
    let v = deger;
    try {
      v = decodeURIComponent(deger.replace(/\+/g, ' '));
    } catch {
      // ham değer
    }
    v = v.trim().slice(0, 100);
    if (v) sonuc[ad as (typeof UTM)[number]] = v;
  }
  return sonuc;
}

/** install_attributed olayının özellikleri; $set_once kişiye bir kez yazılır. */
export function kurulumYuku(platform: string, referrer: string | null): Record<string, unknown> {
  const utm = referrer ? referrerUtm(referrer) : {};
  const kisi: Record<string, string> = {
    first_install_platform: platform,
    first_install_source:
      utm.utm_source ?? (platform === 'android' ? 'unknown' : 'not_available_ios'),
  };
  if (utm.utm_source) kisi.first_utm_source = utm.utm_source;
  if (utm.utm_medium) kisi.first_utm_medium = utm.utm_medium;
  if (utm.utm_campaign) kisi.first_utm_campaign = utm.utm_campaign;
  return { ...kisi, has_referrer: referrer !== null, $set_once: kisi };
}
