import type { DetayliTest, DetayliTestGonder } from '@butika/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { trackEvents } from './queries';

// Detaylı test: son cevap ve kaydetme. Kaydedince kategori ve butik sırası yenilenir.
// Tasarım: docs/superpowers/specs/2026-10-16-detayli-test-tasarim.md (§3, §4)

export function useDetayliTest() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['detayli-test', userId],
    enabled: !!userId,
    queryFn: () => api.get<DetayliTest | null>('/me/detayli-test'),
  });
}

export function useDetayliTestKaydet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (g: DetayliTestGonder) => api.put<DetayliTest>('/me/detayli-test', g),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['detayli-test'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      qc.invalidateQueries({ queryKey: ['boutiques'] });
    },
  });
}

/** Vitrindeki detaylı test afişi: göründü / tıklandı / kapatıldı (PostHog + sunucu, admin raporu). */
export function trackDetayliDavet(p: { eylem: 'gorundu' | 'tiklandi' | 'kapatildi' }) {
  void trackEvents([{ type: 'detayli_davet', payload: { eylem: p.eylem } }]);
}
