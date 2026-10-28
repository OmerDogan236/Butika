import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { trackEvents } from '../api/queries';
import { AramaOlcer, type AramaOlcumKaydi, aramaYuku } from '../lib/arama-olcumu';

/**
 * Ekran başına bir arama ölçer. target: aramanın neyi taradığı
 * ('boutique' = vitrin kutusu, 'boutique_and_saved' = arama ekranı).
 * Ekrandan çıkılırken bekleyen (henüz sayılmamış) arama düşer.
 */
export function useAramaOlcumu(target: string): AramaOlcer {
  const olcer = useRef<AramaOlcer | null>(null);
  if (!olcer.current) {
    olcer.current = new AramaOlcer(
      (k) => trackEvents([{ type: 'search', payload: aramaYuku(k, target) }]),
      () => Crypto.randomUUID(),
    );
  }
  useEffect(() => () => olcer.current?.vazgec(), []);
  return olcer.current;
}

/** Ekrandaki aramanın sayılmış kaydı (henüz sayılmadıysa null). */
export function useAramaKaydi(olcer: AramaOlcer): AramaOlcumKaydi | null {
  const [kayit, setKayit] = useState<AramaOlcumKaydi | null>(null);
  useEffect(() => olcer.dinle(setKayit), [olcer]);
  return kayit;
}
