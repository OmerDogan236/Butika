import { icHesapMi } from '@butika/types';
import * as Crypto from 'expo-crypto';
import { PostHog } from 'posthog-react-native';

// PostHog (ürün analitiği) yapılandırması.
// Gerçek "Project API Key" EXPO_PUBLIC_POSTHOG_KEY ortam değişkeniyle verilir;
// buradaki değer yalnızca yer tutucudur.
const POSTHOG_KEY =
  process.env.EXPO_PUBLIC_POSTHOG_KEY ?? 'phc_PROJE_ANAHTARI';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

// Tek bir paylaşılan istemci. Olaylar kuyruğa alınıp toplu gönderilir;
// ağ kopukluğunda kaybolmaz.
// Oturum kaydı (session replay): kullanıcının ekranlarda nasıl gezindiğini PostHog'da
// izlemek için. Yerel modül @posthog/react-native-plugin ister (Expo Go'da çalışmaz).
// Gizlilik: ekranın tamamını maskelemek kaydı okunmaz yapıyordu (22 Eki: yalnız siyah
// bloklar). Artık yazılar ve ürün görselleri görünür; kişisel olanlar tek tek
// PostHogMaskView ile gizli: bütün yazı alanları (arama, Butikcan sorusu, yorum, form),
// Butikcan'daki kullanıcı balonu, son aramalar, sipariş/kargo numarası, profil özeti. Butik sitesi
// (WebView) tümüyle gizli — ödeme/adres formları orada. Konsol ve ağ kaydı alınmaz.
// Yeni bir yazı alanı eklerken onu da PostHogMaskView içine al.
// Örnekleme oranı burada verilmez → PostHog proje ayarından yönetilir (17 Eki: %100;
// ücretsiz mobil kota ayda 2.500 kayıt, uygulama ~350 oturum/ay).
export const posthog = new PostHog(POSTHOG_KEY, {
  host: POSTHOG_HOST,
  enableSessionReplay: true,
  sessionReplayConfig: {
    maskAllTextInputs: false,
    maskAllImages: false,
    maskAllSandboxedViews: true,
    captureLog: false,
    captureNetworkTelemetry: false,
  },
});

/** Bir olayı PostHog'a gönderir. Analitik best-effort'tur; UI hatası üretmez. */
export function captureEvent(type: string, payload?: Record<string, unknown>) {
  try {
    posthog.capture(type, payload as Record<string, unknown> as never);
  } catch {
    // yut — analitik uygulamayı asla bozmamalı
  }
}

/** Giriş yapan kullanıcıyı PostHog'a tanıtır (kim olduğu, hangi pazar/dil). */
export function identifyUser(user: {
  id: string;
  email?: string | null;
  displayName?: string | null;
  gender?: string | null;
  countryCode?: string | null;
  language?: string | null;
}) {
  try {
    // Ekip hesabı (sahip, geliştirici, App Review): bu cihazdan hiçbir olay ve oturum
    // kaydı gitmez. Tercih PostHog'da kalıcıdır; aynı cihazda gerçek bir kullanıcı
    // girerse kayıt yeniden açılır.
    if (icHesapMi(user.email)) {
      void posthog.optOut();
      return;
    }
    if (posthog.optedOut) void posthog.optIn();
    // Yalnız tanımlı alanları gönder — PostHog undefined değer kabul etmiyor.
    const props: Record<string, string> = {};
    if (user.email) props.email = user.email;
    if (user.displayName) props.name = user.displayName;
    if (user.gender) props.gender = user.gender;
    if (user.countryCode) props.country = user.countryCode;
    if (user.language) props.language = user.language;
    posthog.identify(user.id, props);
  } catch {
    // yut
  }
}

/** Çıkışta kimliği sıfırlar — sonraki kullanıcı ayrı sayılsın. */
export function resetAnalytics() {
  try {
    posthog.reset();
  } catch {
    // yut
  }
}

const UTM_KAMPANYA: Record<string, string> = {
  boutique_detail: 'butik',
  search: 'arama',
  collection: 'koleksiyon',
  saved: 'kayitli',
  notification: 'bildirim',
};

// Bu oturumda kaç butik dışa-yönlendirme tıklaması oldu (modül ömrü = uygulama oturumu).
let outboundClickCountThisSession = 0;

/**
 * Butik DIŞA YÖNLENDİRME (outbound) tıklamasını PostHog'a gönderir.
 * Kullanıcı bir butiğin kendi sitesine (uygulama içi WebView) yönlendirildiğinde çağrılır.
 * En kritik ürün metriği: keşiften butik sitesine giden trafik.
 */
export function trackBoutiqueOutboundClick(p: {
  boutiqueId: string;
  boutiqueName: string | null;
  // hangi ekrandan: 'boutique_detail' | 'search' | 'collection' | 'saved' | 'notification'
  sourceScreen: string;
  destinationUrl: string; // gidilen butik adresi
  category?: string | null; // tarz dünyası / kategori (yoksa null)
  listPosition?: number | null; // listedeyse 1-tabanlı sıra; değilse null
  // Butik detayına hangi listeden gelindi (vitrin, seçki, fırsat, Butikcan, arama, öneri).
  // source_screen tıklamanın yapıldığı ekranı söyler; bu, kullanıcının o ekrana nereden geldiğini.
  entrySource?: string | null;
}): ButikIzi {
  outboundClickCountThisSession += 1;
  // Her tıklamanın kimliği; butiğe giden adrese butika_click olarak da eklenir (lib/butik-linki).
  // utm_campaign butiğin raporunda görünür: Türkçe, kısa (vitrin, firsat, kayitli, bildirim…).
  const iz: ButikIzi = {
    tik: Crypto.randomUUID(),
    kampanya: p.entrySource ?? UTM_KAMPANYA[p.sourceScreen] ?? p.sourceScreen,
  };
  captureEvent('boutique_outbound_click', {
    boutique_id: p.boutiqueId,
    boutique_name: p.boutiqueName,
    source_screen: p.sourceScreen,
    destination_url: p.destinationUrl,
    category: p.category ?? null,
    list_position: p.listPosition ?? null,
    entry_source: p.entrySource ?? null,
    click_id: iz.tik,
    utm_campaign: iz.kampanya,
    is_first_click_in_session: outboundClickCountThisSession === 1,
  });
  return iz;
}

/** Butiğe giden adrese eklenecek tıklama kimliği ve utm_campaign değeri. */
export type ButikIzi = { tik: string; kampanya: string };

/**
 * Arama sonucuna dokunuldu. search_id aynı kimlikli `search` olayına bağlar; böylece
 * "arama yapıp bir şeye tıklayan" oranı hesaplanır. Arama metni burada tekrar gönderilmez.
 */
export function trackSearchResultClick(p: {
  searchId: string | null;
  position: number | null; // sonuç listesindeki 1-tabanlı sıra
  resultType: 'boutique' | 'saved_product';
  boutiqueId: string;
  productId?: string | null;
}) {
  captureEvent('search_result_click', {
    search_id: p.searchId,
    position: p.position,
    result_type: p.resultType,
    boutique_id: p.boutiqueId,
    product_id: p.productId ?? null,
  });
}

/**
 * Vitrinde kategori rafından bir kategori seçildi (açılıştaki otomatik seçim sayılmaz).
 * is_pinned: kullanıcının onboarding'de seçtiği kategorilerden biri mi.
 */
export function trackCategorySelected(p: {
  categoryId: string;
  categoryName: string | null;
  previousCategoryId: string | null;
  isPinned: boolean;
}) {
  captureEvent('category_selected', {
    category_id: p.categoryId,
    category_name: p.categoryName,
    previous_category_id: p.previousCategoryId,
    is_pinned: p.isPinned,
  });
}

// ─── Kaydetme hunisi: kalbe basıldı → kaydedildi / kaydedilemedi ───
// product_saved (başarı) trackEvents ile backend'e de gider; bu ikisi yalnız PostHog'a.

/** Kalbe basıldı (yeni kayıt için). is_home_page: butiğin ana sayfasında, uyarı çıkacak. */
export function trackSaveAttempt(p: { boutiqueId: string | null; isHomePage: boolean }) {
  captureEvent('product_save_attempt', {
    boutique_id: p.boutiqueId,
    is_home_page: p.isHomePage,
  });
}

/**
 * Kaydetme olmadı. reason: timeout (ürün bilgisi 8 sn'de okunamadı), variant_error (beden
 * bilgisi okunamadı), variant_stale (sayfa yenilenmeli), variant_unavailable (beden
 * değiştirilemedi), size_not_chosen (beden penceresi kapatıldı), already_saved, server_error.
 */
export function trackSaveFailed(p: {
  boutiqueId: string | null;
  reason: string;
  isVariantEdit: boolean;
}) {
  captureEvent('product_save_failed', {
    boutique_id: p.boutiqueId,
    reason: p.reason,
    is_variant_edit: p.isVariantEdit,
  });
}

/**
 * "Stok gelince haber ver" açıldı ya da kapatıldı. result: ok ya da sunucunun ret nedeni
 * (already_in_stock, stock_unknown, restock_unavailable) / error. via: toggle (düğme) ya da
 * size_picker (beden penceresindeki zil, kayıtla birlikte).
 */
export function trackRestockAlertToggled(p: {
  on: boolean;
  via: 'toggle' | 'size_picker';
  sourceScreen: string;
  result: string;
  boutiqueId?: string | null;
}) {
  captureEvent('restock_alert_toggled', {
    on: p.on,
    via: p.via,
    source_screen: p.sourceScreen,
    result: p.result,
    boutique_id: p.boutiqueId ?? null,
  });
}

// ─── Aktivasyon / retention çekirdek event'leri (hepsi PostHog'a; backend'e değil) ───

/** Yeni kayıt mı, mevcut giriş mi — user.createdAt'e göre ayırt eder (yeni = son 60 sn içinde oluşturulmuş). */
export function trackAuthResult(user: { createdAt: string }, method: string) {
  let isNew = false;
  try {
    isNew = Date.now() - new Date(user.createdAt).getTime() < 60_000;
  } catch {
    // createdAt okunamazsa güvenli tarafta 'login' say
  }
  captureEvent(isNew ? 'sign_up' : 'login', { method });
}

/**
 * Uygulama arka plandan öne geldi. Özellikler app_open'la aynı: source (push / deeplink /
 * organic) ve varsa push_type, push_campaign, push_event_id, utm_source/medium/campaign, link_screen.
 */
export function trackAppForegrounded(kaynak: Record<string, string>) {
  captureEvent('app_foregrounded', kaynak);
}

/**
 * Onboarding'deki isteğe bağlı "Butika'yı nereden duydun?" cevabı. Kişi özelliği heard_from
 * bir kez yazılır (iOS'ta kurulum kaynağı başka yoldan bilinemiyor).
 */
export function trackHeardFrom(answer: string) {
  captureEvent('heard_from_answered', { answer, $set_once: { heard_from: answer } });
}

/** Onboarding (ilk açılış tanıtımı) tamamlandığında. */
export function trackOnboardingCompleted() {
  captureEvent('onboarding_completed');
}

/** Butikcan'a bir sorgu gönderildiğinde. Gizlilik: ham metin GÖNDERİLMEZ — sadece uzunluk/tur sayısı. */
export function trackButikcanUsed(p: { queryLength: number; turnCount: number }) {
  captureEvent('butikcan_used', { query_length: p.queryLength, turn_count: p.turnCount });
}

/**
 * Butikcan cevap verdi ya da veremedi. boutique_count: önerdiği butik sayısı; is_empty: hiç
 * butik önermedi. Cevap metni gönderilmez, yalnız uzunluğu. butikcan_used ile turn_count
 * üzerinden eşleşir.
 */
export function trackButikcanReplied(p: {
  turnCount: number;
  ok: boolean;
  boutiqueCount: number;
  replyLength: number;
  latencyMs: number;
  errorStatus?: number | null;
}) {
  captureEvent('butikcan_replied', {
    turn_count: p.turnCount,
    result: p.ok ? 'ok' : 'error',
    boutique_count: p.boutiqueCount,
    is_empty: p.ok && p.boutiqueCount === 0,
    reply_length: p.replyLength,
    latency_ms: p.latencyMs,
    error_status: p.errorStatus ?? null,
  });
}

/** Bir yorum yayınlandığında. Gizlilik: ham metin GÖNDERİLMEZ — sadece uzunluk + butik. */
export function trackCommentPosted(p: { boutiqueId: string; commentLength: number }) {
  captureEvent('comment_posted', { boutique_id: p.boutiqueId, comment_length: p.commentLength });
}

/** Bir öğe koleksiyon(lar)a eklendiğinde. */
/**
 * Butik sayfasının açılış süreleri (ms). Hangi butiklerin sitesinin yavaş olduğunu ve
 * yaptığımız hızlandırmaların işe yarayıp yaramadığını buradan görüyoruz.
 */
export function trackWebviewTiming(p: {
  boutiqueId?: string;
  ilkCizimMs: number | null;
  tamYuklemeMs: number | null;
}) {
  captureEvent('webview_timing', {
    boutique_id: p.boutiqueId,
    first_paint_ms: p.ilkCizimMs,
    load_end_ms: p.tamYuklemeMs,
  });
}

/**
 * Butik sitesi açılamadı ya da hata sayfası döndü. kind: load (bağlantı / alan adı / SSL —
 * error_code tarayıcının kodu) ya da http (status_code 4xx/5xx). Adresin yalnız alan adı
 * gider: sayfa adresinde sepet/ödeme bilgisi olabilir.
 */
export function trackWebviewError(p: {
  boutiqueId?: string;
  kind: 'load' | 'http';
  host: string | null;
  statusCode?: number | null;
  errorCode?: number | null;
  onFirstLoad: boolean;
}) {
  captureEvent('webview_error', {
    boutique_id: p.boutiqueId ?? null,
    kind: p.kind,
    host: p.host,
    status_code: p.statusCode ?? null,
    error_code: p.errorCode ?? null,
    on_first_load: p.onFirstLoad,
  });
}

export function trackCollectionAdd(p: { collectionCount: number }) {
  captureEvent('collection_add', { collection_count: p.collectionCount });
}

// ─── Push bildirimleri (izin → gönderim → açılış hunisi) ───
// Gönderim/teslim olayları (push_sent, push_delivered, push_failed) sunucudan gelir.

/**
 * Bildirim izni durumu. Her açılışta kişi özelliği (push_permission) güncellenir;
 * `push_permission_prompted` olayı ise yalnız sistem izin penceresi gösterildiğinde gider.
 */
// status: Expo'nun değeri (granted/denied/undetermined), olayda eskisi gibi kalır.
// izin: kişi özelliği push_permission'a yazılan değer (granted/denied/provisional/not_determined);
// 1.2.1'den önce burada Expo'nun değeri yazılıyordu.
export function trackPushPermission(p: {
  status: string;
  izin: string;
  prompted: boolean;
  platform: string;
}) {
  captureEvent(p.prompted ? 'push_permission_prompted' : 'push_permission_checked', {
    status: p.status,
    platform: p.platform,
    $set: { push_permission: p.izin },
  });
}

/** Sistem izin penceresine kullanıcının verdiği cevap (yalnız pencere gösterildiğinde). */
export function trackPushPermissionResult(p: { result: string; platform: string }) {
  captureEvent('push_permission_result', {
    result: p.result,
    platform: p.platform,
    $set: { push_permission: p.result },
  });
}

/** İzin, uygulama dışında (telefonun ayarlarından) değişti; açılışta ya da öne gelişte fark edilir. */
export function trackPushPermissionChanged(p: { from: string; to: string; platform: string }) {
  captureEvent('push_permission_changed', {
    from: p.from,
    to: p.to,
    platform: p.platform,
    $set: { push_permission: p.to },
  });
}

/** Cihaz push kaydı başarısız (token alınamadı / API reddetti). Ham hata metni gönderilmez. */
export function trackPushRegisterFailed(p: { stage: string }) {
  captureEvent('push_register_failed', { stage: p.stage });
}

/** Bir bildirim geldi (uygulama açıkken — kapalıyken sistem gösterir, olay oluşmaz). */
export function trackPushReceived(p: { type: string | null }) {
  captureEvent('push_received_foreground', { notification_type: p.type });
}

/** Kullanıcı bildirime dokundu. En kritik geri-dönüş sinyali. */
export function trackPushOpened(p: {
  type: string | null;
  eventId: string | null;
  // Duyurunun hedefi (firsat, butik:<id>…); hedefsiz bildirimde null.
  target: string | null;
  coldStart: boolean;
  /** Duyuru bildiriminin kampanya adı (admin'den gönderilenler dahil); yoksa null. */
  campaign?: string | null;
}) {
  captureEvent('push_opened', {
    notification_type: p.type,
    event_id: p.eventId,
    target: p.target,
    cold_start: p.coldStart,
    campaign: p.campaign ?? null,
  });
}

// ─── 1.2.0 yenilikleri: Fırsat sekmesi, seçki şeridi (Editörün Seçimi), Kişisel Butika ───

/** Fırsat sekmesi açıldı (her odaklanmada). */
export function trackFirsatSekmesi(p: { butikSayisi: number }) {
  captureEvent('firsat_sekmesi_acildi', { butik_sayisi: p.butikSayisi });
}

/** Fırsat sekmesinde bir butiğe dokunuldu. sira 1-tabanlı. */
export function trackFirsatButik(p: { boutiqueId: string; boutiqueName: string; sira: number }) {
  captureEvent('firsat_butik_tiklandi', {
    boutique_id: p.boutiqueId,
    boutique_name: p.boutiqueName,
    sira: p.sira,
  });
}

/** Vitrindeki seçki şeridi (ör. "Sonbahar Seçkisi") ekranda göründü — vitrin açılışı başına bir kez. */
export function trackSeckiGorundu(p: { butikSayisi: number; baslik: string | null }) {
  captureEvent('secki_seridi_gorundu', { butik_sayisi: p.butikSayisi, baslik: p.baslik });
}

/** Seçki şeridinde bir butiğe dokunuldu. sira 1-tabanlı. */
export function trackSeckiButik(p: {
  boutiqueId: string;
  boutiqueName: string;
  sira: number;
  baslik: string | null;
}) {
  captureEvent('secki_butik_tiklandi', {
    boutique_id: p.boutiqueId,
    boutique_name: p.boutiqueName,
    sira: p.sira,
    baslik: p.baslik,
  });
}

/** Vitrindeki Kişisel Butika davet kartı: göründü / "başla" / kapatıldı. */
export function trackKisiselDavet(p: { eylem: 'gorundu' | 'basla' | 'kapat' }) {
  captureEvent('kisisel_davet_karti', { eylem: p.eylem });
}

/** Kişisel Butika akışı kendiliğinden açıldı (tarz testi ya da tanıtım videosu adımı). */
export function trackKisiselAkisAcildi(p: { adim: string }) {
  captureEvent('kisisel_akis_acildi', { adim: p.adim });
}

/** Kişisel Butika akışında "Daha sonra" seçildi. */
export function trackKisiselDahaSonra() {
  captureEvent('kisisel_daha_sonra');
}
