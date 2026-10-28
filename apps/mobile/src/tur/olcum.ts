// Turun SAF olcum duzeltmesi. Buraya React Native ice aktarmasi EKLENMEZ —
// dosya `bun test` ile calisiyor (bkz. adimlar.ts'teki ayni kural).

import type { Dikdortgen } from './adimlar';

/**
 * Android'de `measureInWindow` dondugu y'den durum cubugu yuksekligini
 * DAIMA cikarir — React Native'in bilinen hatasi (#19497, targetSdk 35 +
 * edge-to-edge ile #50509).
 *
 * Bizde neden onemli: `app.json` icinde `edgeToEdgeEnabled: true`. Yani
 * uygulama penceresi durum cubugu dahil TUM ekrani kaplar ve `TurKatmani`
 * de koke `StyleSheet.absoluteFill` ile, tam ekrana cizer. Iki taraf ayni
 * uzayda olmasina ragmen olcum eksik geldigi icin her vurgu durum cubugu
 * yuksekligi kadar YUKARI kayar: ipucu metni dogru, isaret ettigi oge yanlis.
 *
 * iOS'ta boyle bir cikarma yok, olcum dogru gelir — bu yuzden hata yalniz
 * Android'de gorulur ve dogrulama iOS simulatorunde yapildiginda gozden kacar.
 *
 * `ustInset` = `useSafeAreaInsets().top`; edge-to-edge Android'de bu deger
 * durum cubugu yuksekligidir.
 */
export function olcumuDuzelt(olculen: Dikdortgen, platform: string, ustInset: number): Dikdortgen {
  if (platform !== 'android' || ustInset === 0) return olculen;
  return { ...olculen, y: olculen.y + ustInset };
}
