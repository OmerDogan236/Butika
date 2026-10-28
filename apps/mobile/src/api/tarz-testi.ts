import type { OneriYaniti, ProfilDurumu, SonTarzTesti, TarzTestiGonder } from '@butika/types';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api';
import { yenidenDenenebilirMi } from '../lib/kisisel-akis';
import { queryClient } from '../lib/query-client';
import { useAuthStore } from '../stores/auth';
import { useKisiselStore } from '../stores/kisisel';
import { useLocaleStore } from '../stores/locale';
import { useOnboardingStore } from '../stores/onboarding';

// Tarz testi ve "Sana önerilen butikler".
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md

export function useSonTarzTesti() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['tarz-testi', userId],
    enabled: !!userId,
    queryFn: () => api.get<SonTarzTesti | null>('/me/tarz-testi'),
  });
}

/**
 * Sunucu bu kullanıcıyı profile göre sıralıyor mu (GET /me/profil-durumu). Test yapmamış ama
 * kayıtlarıyla profili dolmuş kullanıcıya da "Sana özel" gösterilir. Uç yoksa (eski sunucu)
 * ya da hata olursa yeniden denenmez; seçenek bugünkü gibi yalnız teste bağlı kalır.
 */
export function useProfilDurumu() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['profil-durumu', userId],
    enabled: !!userId,
    retry: false,
    queryFn: () => api.get<ProfilDurumu>('/me/profil-durumu'),
  });
}

function testSonrasiTazele(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['tarz-testi'] });
  qc.invalidateQueries({ queryKey: ['profil-durumu'] });
  qc.invalidateQueries({ queryKey: ['profil-ozet'] });
  qc.invalidateQueries({ queryKey: ['oneriler'] });
  // "Sana özel" sıralama yeni cevaba göre gelsin.
  qc.invalidateQueries({ queryKey: ['boutiques'] });
}

/** Telefonda bekleyen cevabı yeniden göndermek için (hook dışı: açılışta kök yerleşimden). */
export async function tarzTestiniGonder(cevap: TarzTestiGonder): Promise<SonTarzTesti> {
  const sonuc = await api.post<SonTarzTesti>('/me/tarz-testi', cevap);
  testSonrasiTazele(queryClient);
  return sonuc;
}

export const TARZ_TESTI_GONDER_ANAHTARI = ['tarz-testi-gonder'] as const;

export function useTarzTestiGonder() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: TARZ_TESTI_GONDER_ANAHTARI,
    mutationFn: async (cevap: TarzTestiGonder) => {
      // Telefonda bekleyen eski cevap o sırada yeniden gönderiliyorsa önce o bitsin:
      // eski cevap yenisinden sonra varıp onu ezmesin.
      await useKisiselStore.getState().bekleyenGonderiminiBekle();
      return api.post<SonTarzTesti>('/me/tarz-testi', cevap);
    },
    onSuccess: () => {
      // Eski bekleyen cevap sonraki açılışta bu yeni cevabı ezmesin.
      void useKisiselStore.getState().bekleyeniSil();
      testSonrasiTazele(qc);
    },
    // Hook düzeyinde: ekran bu arada kapanmış olsa da çalışır. Kullanıcı bekletilmez;
    // cevap telefonda saklanır, sonraki açılışta yeniden gönderilir (spec §4).
    onError: (hata, cevap) => {
      const status = hata instanceof ApiError ? hata.status : undefined;
      if (yenidenDenenebilirMi(status)) void useKisiselStore.getState().bekleyenCevapKaydet(cevap);
    },
  });
}

export function useOneriler() {
  const userId = useAuthStore((s) => s.user?.id);
  const country = useLocaleStore((s) => s.country);
  // Onboarding kategorileri yalnız cihazda durur; öneri isteğine eklenir, sunucuda saklanmaz.
  const kategoriler = useOnboardingStore((s) => s.selectedCategoryIds)
    .slice(0, 30)
    .join(',');
  return useQuery({
    queryKey: ['oneriler', userId, country, kategoriler],
    enabled: !!userId && !!country,
    staleTime: 60 * 1000,
    queryFn: () =>
      api.get<OneriYaniti>(
        `/me/oneriler?country=${country}${kategoriler ? `&kategoriler=${kategoriler}` : ''}`,
      ),
  });
}
