import { QueryClient } from '@tanstack/react-query';

// Uygulamanın tek QueryClient'ı. Çıkışta temizlenir (stores/auth.ts signOut): aynı telefonda
// sonra giriş yapan kişi önceki kullanıcının kayıtlarını, koleksiyonlarını, önerilerini görmesin.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60,
    },
  },
});
