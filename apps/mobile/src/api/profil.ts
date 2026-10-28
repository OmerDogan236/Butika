import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// Profil sayfasının özeti — takip, sipariş, tarz, rozet ve son gezilen butikler.
// Bildirimler ayrı uçtan gelir (src/api/notifications.ts).
export interface ProfilOzet {
  takip: {
    adet: number;
    dususAdedi: number;
    sonOtuzGunDususMinor: number;
    paraBirimi: string | null;
    ornekler: { savedProductId: string; baslik: string; eskiMinor: number; yeniMinor: number }[];
  };
  siparis: { yolda: number; teslim: number };
  tarz: {
    /** Son tarz testinin sonucu; test çözülmediyse null. */
    test: { birincil: string | null; ikincil: string | null } | null;
    /** Kayıtlı ürünlerin butiklerinden çıkan tarz. */
    favori: { birincil: string | null; ikincil: string | null; dayanakAdet: number };
  };
  rozetler: { anahtar: string; kazanildi: boolean; ilerleme: number; hedef: number }[];
  sonGezilen: { id: string; name: string; coverImageUrl: string }[];
}

export function useProfilOzet() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: ['profil-ozet', userId],
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: () => api.get<ProfilOzet>('/me/profil-ozet'),
  });
}
