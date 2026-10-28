import { api } from './api';

// Onay metinlerinin versiyonu — metin güncellenince artır (v3...).
// v2 = avukat onaylı nihai metin seti, yürürlük 16.08.2026.
// v3 = Aydınlatma/Açık Rıza v3 (AB+ABD sağlayıcılar, Gemini adı), yürürlük 15.09.2026.
// v4 = 1.2.1 ölçümleri, maskeli oturum kaydı, butik bağlantısındaki utm/butika_click, 19.10.2026.
export const CONSENT_VERSION = 'v4';

export type ConsentType =
  | 'kvkk_acik_riza'
  | 'ticari_ileti'
  | 'cerez_analitik'
  | 'yapay_zeka_aktarim';

// Ortak /consent endpoint'ine rıza kaydı yazar (web ile aynı altyapı).
// IP/User-Agent sunucu tarafında eklenir.
export function recordConsents(input: {
  email?: string;
  userId?: string;
  source: 'mobil_kayit' | 'mobil_butikcan';
  locale?: 'tr' | 'en';
  consents: { type: ConsentType; granted: boolean }[];
}) {
  return api.post('/consent', { textVersion: CONSENT_VERSION, ...input });
}
