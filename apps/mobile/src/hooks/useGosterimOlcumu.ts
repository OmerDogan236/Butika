import { useEffect, useRef } from 'react';
import type { ViewToken } from 'react-native';
import { captureEvent } from '../lib/analytics';
import { GosterimOlcer } from '../lib/gosterim-olcumu';

// Kartın en az yarısı en az 1 sn ekranda kalmalı: hızlı kaydırırken geçilenler ve yazarken
// her harfte değişen arama sonuçları sayılmasın.
const GORUNURLUK = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 };

/**
 * Bir butik listesinin gösterim ölçümü (boutique_impression). Dönen iki değer FlatList'e
 * verilir. liste: vitrin / secki / firsat / arama. anahtar değişince sayım baştan başlar;
 * ortak null iken görülen kartlar bekler (bkz. lib/gosterim-olcumu).
 */
export function useGosterimOlcumu(
  liste: string,
  anahtar: string,
  ortak: Record<string, unknown> | null,
) {
  const olcer = useRef<GosterimOlcer | null>(null);
  if (!olcer.current) {
    olcer.current = new GosterimOlcer(liste, (yuk) => captureEvent('boutique_impression', yuk));
  }
  const ortakMetni = ortak ? JSON.stringify(ortak) : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: ortak içeriği ortakMetni ile izleniyor
  useEffect(() => {
    olcer.current?.baglam(anahtar, ortak);
  }, [anahtar, ortakMetni]);

  // FlatList bu iki değerin sonradan değişmesine izin vermez; bir kez oluşturulur.
  const sabit = useRef({
    viewabilityConfig: GORUNURLUK,
    onViewableItemsChanged: ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const kartlar = [];
      for (const v of viewableItems) {
        const id = (v.item as { id?: unknown } | null)?.id;
        if (v.isViewable && typeof id === 'string' && v.index !== null)
          kartlar.push({ id, sira: v.index + 1 });
      }
      olcer.current?.gorundu(kartlar);
    },
  });
  return sabit.current;
}
