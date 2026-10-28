import type { RestockAlert, SavedTracking, SiparislerYaniti } from '@butika/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { captureEvent } from '../lib/analytics';
import { ApiError, api, apiFetch } from '../lib/api';
import { queryClient } from '../lib/query-client';
import { takipBekliyorMu } from '../lib/restock';
import { type User, useAuthStore } from '../stores/auth';
import { useLocaleStore } from '../stores/locale';
import { type VitrinCinsiyeti, useVitrinStore } from '../stores/vitrin';

export interface Category {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface Boutique {
  id: string;
  categoryIds: string[];
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  sortOrder: number;
  createdAt: string;
}

/** Vitrinin üstündeki "Editörün Seçimi" şeridinin kartı. */
export interface EditorunSecimiButigi extends Boutique {
  editorNotu: string | null;
}

/** Fırsat sekmesinin ("Hangi butiklerde indirim var?") kartı. */
export interface FirsatButigi extends Boutique {
  firsatNotu: string | null;
}

/** Pazarın vitrin ayarları (admin: "Vitrin ayarları"). */
export interface VitrinAyarlari {
  /** Editörün Seçimi şeridinin başlığı; null ise uygulamanın kendi metni. */
  seckiBasligi: string | null;
  /** Mağazadaki son sürümler; "Yeni sürüm var" kartı buna bakar. */
  guncelSurum: { ios: string | null; android: string | null };
}

export interface SavedProduct {
  tracking?: SavedTracking;
  restockAlert?: RestockAlert;
  id: string;
  boutiqueId: string;
  url: string;
  title: string;
  imageUrl: string | null;
  description: string | null;
  createdAt: string;
  // Satın alım takibi (null = satın alınmadı / yolda)
  purchasedAt: string | null;
  orderNumber: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  deliveredAt: string | null;
  boutique: { id: string; name: string; coverImageUrl: string };
}

export interface PurchaseUpdateInput {
  purchased?: boolean;
  orderNumber?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  delivered?: boolean;
}

export interface SavedProductInput {
  boutiqueId: string;
  url: string;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  priceMinor?: number | null;
  currency?: string | null;
}

// KADIN | ERKEK vitrini: ?country=TR&cinsiyet=erkek (eski sunucu cinsiyeti yok sayar → kadın).
function vitrinSorgusu(country: string | null | undefined, cinsiyet: VitrinCinsiyeti): string {
  const p = new URLSearchParams({ cinsiyet });
  if (country) p.set('country', country);
  return `?${p.toString()}`;
}

export function useCategories() {
  const country = useLocaleStore((s) => s.country);
  const cinsiyet = useVitrinStore((s) => s.cinsiyet);
  return useQuery({
    queryKey: ['categories', country, cinsiyet],
    queryFn: () => api.get<Category[]>(`/categories${vitrinSorgusu(country, cinsiyet)}`),
    enabled: !!country,
    staleTime: 5 * 60 * 1000,
  });
}

export type Siralama = 'onerilen' | 'uygun_once' | 'luks_once' | 'kisisel' | 'alfabetik';

export function useBoutiques(categoryId?: string, siralama: Siralama = 'onerilen') {
  const country = useLocaleStore((s) => s.country);
  return useQuery({
    queryKey: ['boutiques', country, categoryId ?? 'all', siralama],
    queryFn: () => {
      const params = new URLSearchParams();
      if (country) params.set('country', country);
      if (categoryId) params.set('categoryId', categoryId);
      // 'onerilen' varsayılan — parametreyi hiç göndermeyip sunucudaki
      // eski yolu kullanıyoruz.
      if (siralama !== 'onerilen') params.set('sort', siralama);
      const qs = params.toString();
      return api.get<Boutique[]>(`/boutiques${qs ? `?${qs}` : ''}`);
    },
    staleTime: 2 * 60 * 1000,
    enabled: !!country && (categoryId === undefined || categoryId.length > 0),
  });
}

// Anahtar 'boutiques' altında: tarz testi sonrası tazelenince kişisel sıra da yenilenir.
export function useEditorunSecimi() {
  const country = useLocaleStore((s) => s.country);
  const cinsiyet = useVitrinStore((s) => s.cinsiyet);
  return useQuery({
    queryKey: ['boutiques', country, 'editorun-secimi', cinsiyet],
    queryFn: () =>
      api.get<EditorunSecimiButigi[]>(
        `/boutiques/editorun-secimi${vitrinSorgusu(country, cinsiyet)}`,
      ),
    staleTime: 2 * 60 * 1000,
    enabled: !!country,
    // Eski sunucuda uç yok (4xx): şerit gizlenir, boşuna tekrar denenmez.
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
}

export function useFirsatlar() {
  const country = useLocaleStore((s) => s.country);
  const cinsiyet = useVitrinStore((s) => s.cinsiyet);
  return useQuery({
    queryKey: ['boutiques', country, 'firsatlar', cinsiyet],
    queryFn: () =>
      api.get<FirsatButigi[]>(`/boutiques/firsatlar${vitrinSorgusu(country, cinsiyet)}`),
    staleTime: 2 * 60 * 1000,
    enabled: !!country,
    // Eski sunucuda uç yok (4xx): boş liste görünür, boşuna tekrar denenmez.
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
}

export function useVitrinAyarlari() {
  const country = useLocaleStore((s) => s.country);
  return useQuery({
    queryKey: ['vitrin-ayarlari', country],
    queryFn: () =>
      api.get<VitrinAyarlari>(`/vitrin-ayarlari${country ? `?country=${country}` : ''}`),
    staleTime: 5 * 60 * 1000,
    enabled: !!country,
    // Eski sunucuda uç yok (4xx): varsayılan başlık, sürüm kartı yok.
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
}

export function useBoutique(id: string) {
  return useQuery({
    queryKey: ['boutique', id],
    queryFn: () => api.get<Boutique>(`/boutiques/${id}`),
    enabled: !!id,
  });
}

export function useSavedProducts() {
  return useQuery({
    queryKey: ['saved'],
    queryFn: () => api.get<SavedProduct[]>('/saved'),
    staleTime: 30 * 1000,
    refetchInterval: (q) => (q.state.data && takipBekliyorMu(q.state.data) ? 20_000 : false),
  });
}

/** Bağlı butikten otomatik okunan siparişler (Satın Aldıklarım). Pilot dışı: { pilot: false, siparisler: [] }. */
const siparislerSorgusu = {
  queryKey: ['siparisler'],
  queryFn: () => api.get<SiparislerYaniti>('/siparisler'),
  staleTime: 60 * 1000,
};

export function useSiparisler() {
  return useQuery(siparislerSorgusu);
}

/** Girişten sonra bir kez: pilot bilgisi önbellekte hazır olsun (webview ağ beklemeden okur). */
export function siparisleriOnceden() {
  void queryClient.prefetchQuery(siparislerSorgusu).catch(() => {});
}

/** Yalnız önbellekte pilot === true görünüyorsa true; bilinmiyorsa ya da false ise false (ağ yok). */
export function pilotOlduguBiliniyor(): boolean {
  return queryClient.getQueryData<SiparislerYaniti>(siparislerSorgusu.queryKey)?.pilot === true;
}

/** Butik sayfası için Butika etiketli adres (POST /gonderimler); etiket yoksa adres aynen döner. */
export function gonderimAdresiIste(boutiqueId: string, url: string, signal: AbortSignal) {
  return apiFetch<{ url: string }>('/gonderimler', {
    method: 'POST',
    body: { boutiqueId, url },
    signal,
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavedProductInput) => api.post<SavedProduct>('/saved', input),
    onSuccess: (data) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) => {
        if (!prev) return [data];
        if (prev.some((p) => p.id === data.id)) return prev;
        return [data, ...prev];
      });
    },
  });
}

export function useUnsaveByUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.delete(`/saved?url=${encodeURIComponent(url)}`),
    onSuccess: (_data, url) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) => prev?.filter((p) => p.url !== url));
    },
  });
}

export function useUpdateSavedVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; url: string; title: string }) =>
      api.patch<SavedProduct>(`/saved/${id}/variant`, input),
    onSuccess: (updated) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) =>
        prev?.map((row) => (row.id === updated.id ? updated : row)),
      );
      void qc.invalidateQueries({ queryKey: ['collection'] });
    },
  });
}

// "Stok gelince haber ver" for one saved size/colour.
export function useRestockAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on
        ? api.put<{ restockAlert: RestockAlert }>(`/saved/${id}/restock-alert`)
        : api.delete<{ restockAlert: RestockAlert }>(`/saved/${id}/restock-alert`),
    onSuccess: ({ restockAlert }, { id }) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) =>
        prev?.map((row) => (row.id === id ? { ...row, restockAlert } : row)),
      );
    },
  });
}

export function useUnsaveById() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/saved/${id}`),
    onSuccess: (_data, id) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) => prev?.filter((p) => p.id !== id));
    },
  });
}

// ─── Kayıtlı butikler ("Butiklerim") ────────────────────────────────────────
// Butik sayfasındaki kalp ve "Paylaş… → Butika" ile eklenir (api/routes/kayitli-butikler.ts).

export interface KayitliButik {
  id: string;
  name: string;
  url: string;
  coverImageUrl: string;
  logoUrl: string | null;
  kaynak: 'uygulama' | 'instagram' | 'site';
  /** Kullanıcının Instagram'dan eklediği, admin onayı bekleyen butik (vitrinde henüz yok). */
  onayBekliyor?: boolean;
  createdAt: string;
}

export type PaylasimSonucu =
  | {
      durum: 'kaydedildi' | 'eklendi';
      butik: Pick<KayitliButik, 'id' | 'name' | 'url' | 'coverImageUrl' | 'logoUrl'>;
    }
  | {
      durum: 'urun_kaydedildi';
      butik: Pick<KayitliButik, 'id' | 'name' | 'url' | 'coverImageUrl' | 'logoUrl'>;
      butikYeni: boolean;
      urun: { id: string; title: string; imageUrl: string | null };
    }
  | { durum: 'oneri_alindi'; hesap: string }
  | { durum: 'gonderi_yakinda' | 'butik_degil' | 'site_yok' | 'anlasilmadi' };

export function useKayitliButikler() {
  return useQuery({
    queryKey: ['kayitli-butikler'],
    queryFn: () => api.get<KayitliButik[]>('/kayitli-butikler'),
    staleTime: 30 * 1000,
  });
}

export function useButikKaydet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boutiqueId, kaydet }: { boutiqueId: string; kaydet: boolean }) =>
      kaydet
        ? api.post('/kayitli-butikler', { boutiqueId })
        : api.delete(`/kayitli-butikler/${boutiqueId}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kayitli-butikler'] }),
  });
}

export function usePaylasimiKaydet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (metin: string) =>
      api.post<PaylasimSonucu>('/kayitli-butikler/paylasim', { metin }),
    onSuccess: (sonuc) => {
      qc.invalidateQueries({ queryKey: ['kayitli-butikler'] });
      if (sonuc.durum === 'urun_kaydedildi') qc.invalidateQueries({ queryKey: ['saved'] });
    },
  });
}

// Satın al / detay güncelle / teslim işaretle / geri al.
export function usePurchaseUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & PurchaseUpdateInput) =>
      api.patch<SavedProduct>(`/saved/${id}/purchase`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<SavedProduct[]>(['saved'], (prev) =>
        prev ? prev.map((p) => (p.id === updated.id ? updated : p)) : prev,
      );
    },
  });
}

export interface Collection {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  coverUrls: string[];
}

export interface CollectionDetail {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionProductList {
  items: SavedProduct[];
  nextCursor: string | null;
}

export function useCollections() {
  return useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<Collection[]>('/collections'),
    staleTime: 30 * 1000,
  });
}

export function useCollection(id: string) {
  return useQuery({
    queryKey: ['collection', id],
    queryFn: () => api.get<CollectionDetail>(`/collections/${id}`),
    enabled: !!id,
  });
}

export function useCollectionProducts(id: string) {
  return useQuery({
    queryKey: ['collection-products', id],
    queryFn: () => api.get<CollectionProductList>(`/collections/${id}/products`),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      api.post<CollectionDetail>('/collections', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useUpdateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; description?: string }) =>
      api.patch<CollectionDetail>(`/collections/${id}`, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['collection', id] });
    },
  });
}

export function useDeleteCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/collections/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useBatchCreateCollections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) =>
      api.post<{ created: number; items: { id: string; name: string }[] }>('/collections/batch', {
        names,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collections'] });
    },
  });
}

export function useAddToCollections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ savedId, collectionIds }: { savedId: string; collectionIds: string[] }) =>
      api.post<{ ok: true; added: number }>(`/saved/${savedId}/collections`, {
        collectionIds,
      }),
    onSuccess: (_data, { collectionIds }) => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      for (const cid of collectionIds) {
        qc.invalidateQueries({ queryKey: ['collection-products', cid] });
      }
    },
  });
}

export function useRemoveFromCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ savedId, collectionId }: { savedId: string; collectionId: string }) =>
      api.delete(`/saved/${savedId}/collections/${collectionId}`),
    onSuccess: (_data, { collectionId }) => {
      qc.invalidateQueries({ queryKey: ['collections'] });
      qc.invalidateQueries({ queryKey: ['collection-products', collectionId] });
    },
  });
}

export interface CommentUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  gender: 'female' | 'male' | null;
  heightCm: number | null;
  weightKg: number | null;
}

export interface Comment {
  id: string;
  userId: string;
  boutiqueId: string;
  url: string;
  body: string;
  createdAt: string;
  user: CommentUser;
}

export interface CommentList {
  items: Comment[];
  nextCursor: string | null;
}

export function useComments(url: string) {
  return useQuery({
    queryKey: ['comments', url],
    queryFn: () => api.get<CommentList>(`/comments?url=${encodeURIComponent(url)}`),
    enabled: url.length > 0,
    staleTime: 15 * 1000,
  });
}

export function useCommentCount(url: string) {
  return useQuery({
    queryKey: ['comment-count', url],
    queryFn: async () => {
      const res = await api.get<{ counts: Record<string, number> }>(
        `/comments/counts?urls=${encodeURIComponent(url)}`,
      );
      return res.counts[url] ?? 0;
    },
    enabled: url.length > 0,
    staleTime: 30 * 1000,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { boutiqueId: string; url: string; body: string }) =>
      api.post<Comment>('/comments', input),
    onSuccess: (created) => {
      qc.setQueryData<CommentList>(['comments', created.url], (prev) => {
        if (!prev) return { items: [created], nextCursor: null };
        return { ...prev, items: [created, ...prev.items] };
      });
      qc.setQueryData<number>(['comment-count', created.url], (prev) => (prev ?? 0) + 1);
    },
  });
}

export interface SuggestionCreated {
  id: string;
  status: 'pending' | 'approved';
  createdAt: string;
}

export function useSuggestBoutique() {
  const country = useLocaleStore((s) => s.country);
  return useMutation({
    mutationFn: (input: { name: string; url: string; note?: string }) =>
      api.post<SuggestionCreated>(`/suggestions${country ? `?country=${country}` : ''}`, input),
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; url: string }) => api.delete(`/comments/${id}`),
    onSuccess: (_data, { id, url }) => {
      qc.setQueryData<CommentList>(['comments', url], (prev) =>
        prev ? { ...prev, items: prev.items.filter((c) => c.id !== id) } : prev,
      );
      qc.setQueryData<number>(['comment-count', url], (prev) => (prev ? Math.max(0, prev - 1) : 0));
    },
  });
}

export type CommentReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

// Bir yorumu şikayet et (App Store 1.2 moderasyonu).
export function useReportComment() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: CommentReportReason }) =>
      api.post(`/comments/${id}/report`, { reason }),
  });
}

// Bir kullanıcıyı engelle — o kişinin yorumları listeden kalkar.
export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId }: { userId: string; url: string }) => api.post(`/blocks/${userId}`),
    onSuccess: (_data, { userId, url }) => {
      qc.setQueryData<CommentList>(['comments', url], (prev) =>
        prev ? { ...prev, items: prev.items.filter((c) => c.userId !== userId) } : prev,
      );
      qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });
}

export function useUpdateProfile() {
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: (body: {
      gender?: 'female' | 'male' | null;
      heightCm?: number | null;
      weightKg?: number | null;
      showStatsInComments?: boolean;
      displayName?: string;
    }) => api.patch<User>('/me', body),
    onSuccess: (updated) => setUser(updated),
  });
}

export interface SearchResult {
  query: string;
  boutiques: Boutique[];
  savedProducts: SavedProduct[];
}

export function useSearch(query: string) {
  const country = useLocaleStore((s) => s.country);
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['search', country, trimmed],
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmed });
      if (country) params.set('country', country);
      return api.get<SearchResult>(`/search?${params.toString()}`);
    },
    enabled: trimmed.length > 0 && !!country,
    staleTime: 30 * 1000,
  });
}

/** Vitrin arama kutusu: yalnız eşleşen butikler, alakaya göre sıralı. */
export function useButikArama(query: string) {
  const country = useLocaleStore((s) => s.country);
  const cinsiyet = useVitrinStore((s) => s.cinsiyet);
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['butik-arama', country, cinsiyet, trimmed],
    queryFn: () => {
      const params = new URLSearchParams({ q: trimmed, cinsiyet });
      if (country) params.set('country', country);
      return api.get<{ query: string; boutiques: Boutique[] }>(
        `/search/butikler?${params.toString()}`,
      );
    },
    enabled: trimmed.length >= 2 && !!country,
    staleTime: 60 * 1000,
    placeholderData: (onceki) => onceki,
  });
}

export interface ButikcanAramaSonucu {
  kullanilabilir: boolean;
  boutiques: Boutique[];
}

/** Vitrin aramasında "Ara" tuşu + cümle: Butikcan'ın anlayışıyla sıralı butikler. */
export function useButikcanArama() {
  const country = useLocaleStore((s) => s.country);
  return useMutation({
    mutationFn: (q: string) => {
      const params = new URLSearchParams();
      if (country) params.set('country', country);
      const qs = params.toString();
      return api.post<ButikcanAramaSonucu>(`/search/butikler/butikcan${qs ? `?${qs}` : ''}`, {
        q: q.trim(),
      });
    },
  });
}

export type EventType =
  | 'app_open'
  | 'boutique_view'
  | 'webview_open'
  | 'product_saved'
  | 'product_unsaved'
  | 'product_open'
  | 'search'
  | 'share'
  | 'tarz_testi_basladi'
  | 'tarz_testi_adim'
  | 'oneri_tiklandi'
  | 'detayli_davet';

export interface EventInput {
  type: EventType;
  payload?: Record<string, unknown>;
}

export function trackEvents(events: EventInput[]) {
  // Aynı olayları PostHog'a da yansıt (kendi backend'imize ek olarak).
  for (const e of events) captureEvent(e.type, e.payload);
  return api.post('/events', events).catch(() => {
    // Analytics best-effort; UI hatası göstermez.
  });
}

// ─── Butikcan (AI stil danışmanı — sohbet) ──────────────────────────────────

export type ButikcanBoutique = Boutique & { reason?: string };

export interface ButikcanTurn {
  role: 'user' | 'model';
  text: string;
}

export interface ButikcanChatResponse {
  reply: string;
  boutiques: ButikcanBoutique[];
}

export function useButikcanChat() {
  const country = useLocaleStore((s) => s.country);
  return useMutation({
    mutationFn: (messages: ButikcanTurn[]) =>
      api.post<ButikcanChatResponse>(`/butikcan/chat${country ? `?country=${country}` : ''}`, {
        messages,
      }),
  });
}
