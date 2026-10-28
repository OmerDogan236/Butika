import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import {
  gonderimAdresiIste,
  pilotOlduguBiliniyor,
  trackEvents,
  useCommentCount,
  useSaveProduct,
  useSavedProducts,
  useUnsaveByUrl,
  useUpdateSavedVariant,
} from '../src/api/queries';
import { CollectionPicker } from '../src/components/CollectionPicker';
import { RestockToggle, useRestockToggle } from '../src/components/RestockToggle';
import { SaveCelebration } from '../src/components/SaveCelebration';
import { Toast, type ToastTone } from '../src/components/Toast';
import { VariantPicker } from '../src/components/VariantPicker';
import { TurHedefi } from '../src/components/tur/TurHedefi';
import {
  trackSaveAttempt,
  trackSaveFailed,
  trackWebviewError,
  trackWebviewTiming,
} from '../src/lib/analytics';
import { ApiError } from '../src/lib/api';
import { izleriTemizle, izliAdres } from '../src/lib/butik-linki';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { etiketliAdresAl } from '../src/lib/etiketli-adres';
import { commentsRoute, readWebviewIz, readWebviewRoute } from '../src/lib/route-text';
import {
  type SavedVariant,
  findSavedVariant,
  followSavedVariant,
  readVariants,
  singleVariantSave,
  variantCaptureScript,
  variantUrl,
} from '../src/lib/saved-variant';
import { anaSayfaMi } from '../src/lib/urun-sayfasi';
import { hataAlanAdi, ilkKezMi, sayilacakYuklemeHatasi } from '../src/lib/webview-hatasi';
import { useTurStore } from '../src/stores/tur';
import { theme } from '../src/theme';

type SaveMetadata = {
  kind: string;
  requestId?: string;
  url?: string;
  title?: string;
  image?: string | null;
  description?: string;
  price?: string | null;
  currency?: string | null;
  variantStatus?: string;
  variants?: unknown;
  armRestock?: boolean;
  editSavedId?: string;
  // The page the size was chosen on, kept while the save is in flight.
  pageUrl?: string;
};

const OG_EXTRACT_SCRIPT = `(function(){
  function og(k){
    return (document.querySelector('meta[property="og:'+k+'"]')||{}).content ||
           (document.querySelector('meta[name="twitter:'+k+'"]')||{}).content ||
           null;
  }

  var firstImgEl = document.querySelector('img[src]:not([src=""])');
  var firstImg = firstImgEl ? firstImgEl.src : null;

  var selectedPrice = null;
  var selectedCurrency = null;

  function isActuallyDisplayed(el) {
    if (!el) return false;

    var rect = el.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= 0 ||
      rect.left >= window.innerWidth
    ) {
      return false;
    }

    var node = el;

    while (node && node !== document.documentElement) {
      var style = window.getComputedStyle(node);

      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity || '1') === 0 ||
        node.hidden ||
        node.getAttribute('aria-hidden') === 'true'
      ) {
        return false;
      }

      node = node.parentElement;
    }

    var x = Math.max(
      0,
      Math.min(window.innerWidth - 1, rect.left + rect.width / 2)
    );

    var y = Math.max(
      0,
      Math.min(window.innerHeight - 1, rect.top + rect.height / 2)
    );

    var topElement = document.elementFromPoint(x, y);

    if (!topElement) return false;

    return (
      topElement === el ||
      el.contains(topElement) ||
      topElement.contains(el)
    );
  }

  /*
   * Zara SPA navigasyonunda önceki ürünün DOM'u kısa süre
   * sayfada kalabildiği için querySelector ile ilk elementi
   * doğrudan almıyoruz.
   *
   * Gerçekten ekranda çizilen aktif fiyat elementini seçiyoruz.
   */
  var mainPriceElements = Array.from(
    document.querySelectorAll(
      '.product-detail-card-info__info-header-top-content .price-current__amount'
    )
  );

  var mainPriceEl =
    mainPriceElements.find(function(el) {
      return isActuallyDisplayed(el);
    }) || null;

  if (mainPriceEl) {
    /*
     * Zara fiyatı semantik olarak şu yapıda sağlıyor:
     *
     * <data data-currency="TRY" value="3990.00">
     *
     * Metni parse etmek yerine mümkün olduğunda doğrudan
     * makine-okunabilir value/currency değerlerini kullanıyoruz.
     */
    var semanticPriceEl = mainPriceEl.querySelector(
      'data[data-currency][value]'
    );

    var semanticPrice = semanticPriceEl
      ? semanticPriceEl.getAttribute('value')
      : null;

    var semanticCurrency = semanticPriceEl
      ? semanticPriceEl.getAttribute('data-currency')
      : null;

    if (
      semanticPrice &&
      /^\\d+(?:[.,]\\d+)?$/.test(semanticPrice.trim())
    ) {
      selectedPrice = semanticPrice.trim();

      if (semanticCurrency) {
        selectedCurrency = semanticCurrency.toUpperCase();
      }
    }

    /*
     * Semantik data alanı bulunamazsa kullanıcıya gösterilen
     * fiyat metnini fallback olarak kullan.
     */
    if (!selectedPrice) {
      var mainPriceText = (
        mainPriceEl.innerText ||
        mainPriceEl.textContent ||
        ''
      ).trim();

      if (mainPriceText) {
        selectedPrice = mainPriceText;

        if (/TL|\\u20BA/i.test(mainPriceText)) {
          selectedCurrency = 'TRY';
        }
      }
    }
  }

  var payload = {
    kind: 'og',
    url: location.href,
    title: og('title') || document.title || location.hostname,
    image: og('image') || firstImg || null,
    description: og('description') || '',
    price: selectedPrice,
    currency: selectedCurrency
  };

  window.ReactNativeWebView.postMessage(JSON.stringify(payload));
})(); true;`;

const NAV_TRACK_SCRIPT = `(function(){
  function notify(){
    window.ReactNativeWebView.postMessage(
      JSON.stringify({
        kind: 'nav',
        url: location.href
      })
    );
  }

  var oldPushState = history.pushState;
  history.pushState = function(){
    oldPushState.apply(history, arguments);
    notify();
  };

  var oldReplaceState = history.replaceState;
  history.replaceState = function(){
    oldReplaceState.apply(history, arguments);
    notify();
  };

  window.addEventListener('popstate', notify);

  notify();
})(); true;`;

// Yükleme ilerlemesi bu oranı geçince sayfa çizilmiş sayılır ve açılış perdesi kalkar.
// 0.55: Shopify/ikas sitelerinde gövde ve ilk görseller gelmiş, kalanı arka plan takip
// kodları oluyor. Perdeyi %100'e bağlamak, o kodlar takıldığında ekranı kilitliyordu.
// Sayfanın çizilmeye başladığı kabul edilen yükleme oranı. 0.55 gereğinden geç kalıyordu:
// gövde çoğu butikte %35 civarında boyanmış oluyor, kalanı üçüncü taraf betikleri.
const ILK_GORUNTU_ESIGI = 0.35;
// Yükleme oranı hiç ilerlemese bile perde bu süre sonunda kalkar.
const ILK_GORUNTU_SURESI_MS = 1200;
// Hiç ilerleme sinyali gelmezse perde en geç bu süre sonunda kalkar (donmuş ekran olmasın).
const PERDE_EMNIYET_MS = 3000;

export default function WebViewScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{
    boutiqueId: string;
    adres?: string;
    ad?: string;
    kapak?: string;
    kaynak?: string;
    oneriId?: string;
    tik?: string;
    kampanya?: string;
  }>();
  // The address arrives exactly as the caller saved it (src/lib/route-text.ts); an unreadable
  // one opens nothing and says so.
  const route = useMemo(
    () => readWebviewRoute({ adres: params.adres, ad: params.ad, kapak: params.kapak }),
    [params.adres, params.ad, params.kapak],
  );
  const initialUrl = route.url ?? '';
  // Butiğe yönlendirme tıklamasından gelindiyse ilk istek utm + butika_click ile gider (lib/butik-linki).
  // Uygulamanın kendi kullandığı adres (kaydetme, yorum, paylaşım) parametresiz kalır.
  const iz = useMemo(
    () => readWebviewIz({ tik: params.tik, kampanya: params.kampanya }),
    [params.tik, params.kampanya],
  );
  // Bağlı butikte ilk istek sunucunun verdiği etiketli adresle gider (POST /gonderimler).
  // Yalnız önbellekte pilot olduğu bilinen kullanıcıda istenir (en çok 1,5 sn, bu sırada açılış
  // perdesi); pilot değilse ya da bilinmiyorsa istek yok, sayfa bugünkü gibi hemen açılır.
  // Pilot bilgisi açılışta bir kez okunur: sonradan değişirse sayfa yeniden yüklenmesin.
  // Etiketli adres yalnız ilk yükleme içindir: currentUrl ve paylaşım adresi izleriTemizle'den geçer.
  const [pilot] = useState(pilotOlduguBiliniyor);
  const etiketIstenir = !!initialUrl && !!params.boutiqueId && pilot;
  const [ilkAdres, setIlkAdres] = useState<string | null>(etiketIstenir ? null : initialUrl);
  useEffect(() => {
    if (!etiketIstenir) {
      setIlkAdres(initialUrl);
      return;
    }
    let gecersiz = false;
    setIlkAdres(null);
    void etiketliAdresAl(initialUrl, (signal) =>
      gonderimAdresiIste(params.boutiqueId, initialUrl, signal),
    ).then((adres) => {
      if (!gecersiz) setIlkAdres(adres);
    });
    return () => {
      gecersiz = true;
    };
  }, [etiketIstenir, params.boutiqueId, initialUrl]);
  const acilisAdresi = useMemo(
    () => (ilkAdres && iz ? izliAdres(ilkAdres, iz.kampanya, iz.tik) : ilkAdres),
    [ilkAdres, iz],
  );
  const kapakGorseli = route.cover;
  const routeName = route.name ?? undefined;

  const webViewRef = useRef<WebView>(null);
  // Açılış ölçümü: hangi butiğin sitesi yavaş, yaptığımız hızlandırma işe yarıyor mu.
  const acilisAni = useRef<number>(Date.now());
  const ilkCizimMs = useRef<number | null>(null);
  const olcumGonderildi = useRef(false);
  // Bu açılışta sayılan site hataları (webview_error): aynı hata bir kez.
  const sayilanHatalar = useRef(new Set<string>());
  const perdeZamanlayici = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  // The page shown now, for replies that arrive after the user may have moved on.
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;
  const pendingCapture = useRef<{ id: string; url: string; editSavedId?: string } | null>(null);
  // Kullanicinin "yine de kaydet" dedigi ana sayfa adresi; ayni sayfada tekrar sorulmaz.
  const anaSayfaOnayi = useRef<string | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [variantChoice, setVariantChoice] = useState<{
    payload: SaveMetadata;
    variants: SavedVariant[];
  } | null>(null);
  useEffect(
    () => () => {
      if (captureTimer.current) clearTimeout(captureTimer.current);
      if (perdeZamanlayici.current) clearTimeout(perdeZamanlayici.current);
    },
    [],
  );
  useEffect(() => {
    pendingCapture.current = null;
    setCapturing(false);
    setVariantChoice(null);
    if (captureTimer.current) clearTimeout(captureTimer.current);
  }, [currentUrl]);
  const [pageTitle, setPageTitle] = useState<string>(routeName ?? '');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  // Butiğin sayfası ÇİZİLİR ÇİZİLMEZ açılır; "tamamen yüklendi" sinyali BEKLENMEZ.
  // O sinyal sitenin üçüncü taraf takip kodlarına bağlı (Klaviyo, Facebook, Swym…) ve biri
  // takılırsa hiç gelmiyor — sayfa altta hazırken kullanıcı boş ekrana bakıyordu (15 sn+).
  // Bir kez açıldıktan sonra bir daha kapanmaz: site içi gezinmede ekran yanıp sönmesin.
  const [sayfaGorunur, setSayfaGorunur] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone: ToastTone;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);

  const [celebration, setCelebration] = useState<{
    title: string;
    boutiqueName?: string;
    savedId: string;
    /** A product page, so the notice may promise price and stock news. */
    tracked: boolean;
  } | null>(null);

  const [pickerSavedId, setPickerSavedId] = useState<string | null>(null);

  // dismissCelebration sadece [t]'ye bağlı (t dil değişene dek stable) — celebration ref'i
  // üzerinden son state'i okuyup sonrasında "Koleksiyona ekle" linkli toast'u tetikler.
  // Stable ref kritik: SaveCelebration useEffect dep'inde değişirse animasyon restart eder.
  const celebrationRef = useRef<typeof celebration>(null);

  useEffect(() => {
    celebrationRef.current = celebration;
  }, [celebration]);

  // Emniyet: ilerleme sinyali hiç gelmeyen sitelerde perde sonsuza kadar kalmasın.
  useEffect(() => {
    if (sayfaGorunur) return;
    const zamanlayici = setTimeout(() => setSayfaGorunur(true), PERDE_EMNIYET_MS);
    return () => clearTimeout(zamanlayici);
  }, [sayfaGorunur]);

  // Onboarding turu: açılış perdesi kalkıp sayfa görünür olduktan sonra başlar —
  // perde hâlâ ekrandayken tur açılırsa iki katman üst üste biner.
  // Ayrıca YALNIZ ekran odaktayken başlar (bkz. index.tsx'teki aynı açıklama):
  // bu ekran bir modalın (yorumlar, koleksiyon) altında kalırken tur açılmasın.
  const turuBaslat = useTurStore((s) => s.turuBaslat);
  const turGorulenler = useTurStore((s) => s.gorulenler);
  useFocusEffect(
    useCallback(() => {
      if (!sayfaGorunur) return;
      if (turGorulenler === null) return;
      const zamanlayici = setTimeout(() => turuBaslat('webview'), 600);
      return () => clearTimeout(zamanlayici);
    }, [sayfaGorunur, turGorulenler, turuBaslat]),
  );

  const dismissCelebration = useCallback(() => {
    const c = celebrationRef.current;

    setCelebration(null);

    if (c) {
      setToast({
        message: t(c.tracked ? 'boutique.savedTracked' : 'boutique.saved'),
        tone: 'success',
        actionLabel: t('boutique.addToCollection'),
        onAction: () => {
          setPickerSavedId(c.savedId);
          setToast(null);
        },
      });
    }
  }, [t]);

  const loadProgress = useSharedValue(0);

  // Sadece kalp ikonunu scale ediyoruz, pill durur. Celebration zaten ekran-
  // genelinde Butika moment'i oynatıyor; pill içinde ring/glow gerekmez.
  const heartIconScale = useSharedValue(1);

  const { data: saved } = useSavedProducts();
  const saveMutation = useSaveProduct();
  const updateVariantMutation = useUpdateSavedVariant();
  const unsaveMutation = useUnsaveByUrl();
  const restock = useRestockToggle(showToast, 'webview');
  const { data: commentCount = 0 } = useCommentCount(currentUrl);

  const savedRecord = useMemo(() => findSavedVariant(saved, currentUrl), [saved, currentUrl]);

  const isSaved = !!savedRecord;
  const busy =
    capturing ||
    !!variantChoice ||
    saveMutation.isPending ||
    updateVariantMutation.isPending ||
    unsaveMutation.isPending;

  useEffect(() => {
    trackEvents([
      {
        type: 'webview_open',
        payload: {
          boutiqueId: params.boutiqueId,
          url: initialUrl,
          ...(iz ? { click_id: iz.tik } : {}),
        },
      },
    ]);
  }, [params.boutiqueId, initialUrl, iz]);

  // Uyarılar kendiliğinden kapanmaz: kullanıcı çarpıya basar ya da yeni bir uyarı
  // eskisinin yerini alır (29 Eyl testi: 1,9 sn'lik uyarı okunamıyordu).
  /** Kaydetme olmadı (product_save_failed); nedenler lib/analytics'te. */
  function kayitOlmadi(reason: string, isVariantEdit: boolean) {
    trackSaveFailed({ boutiqueId: params.boutiqueId ?? null, reason, isVariantEdit });
  }

  function showToast(message: string, tone: ToastTone = 'success') {
    setToast({ message, tone });
  }

  /** Seçenekli uyarı: kullanıcı karar verene ya da kapatana kadar ekranda kalır. */
  function showChoiceToast(message: string, actionLabel: string, onAction: () => void) {
    setToast({ message, tone: 'info', actionLabel, onAction });
  }

  function playSaveAnimation() {
    // Kalp ikonu: hızlı çek-bırak. Ring yok — celebration full-screen moment'i çağrıştırıyor.
    heartIconScale.value = withSequence(
      withTiming(0.72, {
        duration: 90,
        easing: Easing.out(Easing.cubic),
      }),
      withSpring(1.45, {
        mass: 0.5,
        stiffness: 240,
        damping: 7,
      }),
      withSpring(1, {
        mass: 0.5,
        stiffness: 260,
        damping: 14,
      }),
    );
  }

  function playUnsaveAnimation() {
    // Sessiz kaldırma: kalp ikonu hafifçe sıkışır, halka yok
    heartIconScale.value = withSequence(
      withTiming(0.85, {
        duration: 100,
        easing: Easing.out(Easing.cubic),
      }),
      withSpring(1, {
        mass: 0.4,
        stiffness: 220,
        damping: 16,
      }),
    );
  }

  function handleHeart() {
    if (busy) return;

    if (isSaved) {
      playUnsaveAnimation();

      unsaveMutation.mutate(savedRecord!.url, {
        onSuccess: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

          showToast(t('boutique.removed'), 'info');

          trackEvents([
            {
              type: 'product_unsaved',
              payload: {
                url: currentUrl,
              },
            },
          ]);
        },

        onError: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

          showToast(t('boutique.removeFailed'), 'error');
        },
      });

      return;
    }

    trackSaveAttempt({ boutiqueId: params.boutiqueId ?? null, isHomePage: anaSayfaMi(currentUrl) });

    // Butiğin ANA SAYFASINDA kaydetmek sessiz bir kırık vaat: ana sayfanın fiyatı
    // yok, dolayısıyla "fiyatı düşerse haber veririz" sözü o kayıt için hiç
    // gerçekleşemez. (21-22 Eyl canlı veri: 11 kaydın 9'u ana sayfaydı.)
    // Engellemiyoruz — yalnız bir kez uyarıp kullanıcıyı ürüne yönlendiriyoruz.
    if (anaSayfaMi(currentUrl) && anaSayfaOnayi.current !== currentUrl) {
      const warnedUrl = currentUrl;
      showChoiceToast(t('boutique.homeHint'), t('boutique.saveAnyway'), () => {
        setToast(null);
        // The warning belongs to the page it was shown on. Once the user has left it, its
        // button approves and saves nothing, so that page still warns the next time.
        if (currentUrlRef.current !== warnedUrl) return;
        anaSayfaOnayi.current = warnedUrl;
        playSaveAnimation();
        beginCapture();
      });
      return;
    }

    playSaveAnimation();
    beginCapture();
  }

  function beginCapture(editSavedId?: string) {
    if (busy) return;
    const id = `${Date.now()}-${Math.random()}`;
    pendingCapture.current = { id, url: currentUrl, editSavedId };
    setCapturing(true);
    captureTimer.current = setTimeout(() => {
      pendingCapture.current = null;
      setCapturing(false);
      kayitOlmadi('timeout', !!editSavedId);
      showToast(t('boutique.saveFailed'), 'error');
    }, 8000);
    webViewRef.current?.injectJavaScript(variantCaptureScript(OG_EXTRACT_SCRIPT, id));
  }

  function handleSmartBack() {
    if (canGoBack) {
      webViewRef.current?.goBack();
    } else {
      router.back();
    }
  }

  function handleMessage(e: WebViewMessageEvent) {
    let payload: SaveMetadata;

    try {
      payload = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;
    // Sayfanın bildirdiği adresler de izsiz: currentUrl ile karşılaştırılır, kaydedilir.
    if (typeof payload.url === 'string') payload.url = izleriTemizle(payload.url);
    if (typeof payload.pageUrl === 'string') payload.pageUrl = izleriTemizle(payload.pageUrl);

    if (payload.kind === 'nav' && payload.url) {
      setCurrentUrl(payload.url);
      return;
    }

    if (payload.kind === 'og' && payload.url && payload.title) {
      const pending = pendingCapture.current;
      if (
        !pending ||
        payload.requestId !== pending.id ||
        payload.url !== pending.url ||
        payload.url !== currentUrl
      )
        return;
      payload.editSavedId = pending.editSavedId;
      pendingCapture.current = null;
      if (captureTimer.current) clearTimeout(captureTimer.current);
      setCapturing(false);
      const duzenleme = !!payload.editSavedId;
      if (payload.variantStatus === 'error') {
        kayitOlmadi('variant_error', duzenleme);
        showToast(t('boutique.variantFailed'), 'error');
        return;
      }
      if (payload.variantStatus === 'stale') {
        // The page's size data still describes the page the store was opened at. Only the
        // user's tap reloads this same page; nothing is saved, and the heart is tapped again
        // once it has loaded.
        kayitOlmadi('variant_stale', duzenleme);
        const staleUrl = payload.url;
        showChoiceToast(t('boutique.variantStale'), t('boutique.reloadPage'), () => {
          setToast(null);
          if (currentUrlRef.current !== staleUrl) return;
          webViewRef.current?.reload();
        });
        return;
      }
      if (payload.variantStatus === 'ready') {
        const variants = readVariants(payload.variants);
        if (!variants) {
          kayitOlmadi('variant_error', duzenleme);
          showToast(t('boutique.variantFailed'), 'error');
          return;
        }
        const single = singleVariantSave(payload.url, payload.title, variants);
        if (single) {
          if (payload.editSavedId) {
            kayitOlmadi('variant_unavailable', true);
            showToast(t('boutique.variantNotAvailable'), 'info');
            return;
          }
          saveMetadata({ ...payload, ...single, pageUrl: payload.url, variantStatus: 'chosen' });
          return;
        }
        setVariantChoice({ payload, variants });
        return;
      }
      if (payload.editSavedId) {
        kayitOlmadi('variant_unavailable', true);
        showToast(t('boutique.variantNotAvailable'), 'info');
        return;
      }
      saveMetadata(payload);
    }
  }

  function chooseVariant(variant: SavedVariant, armRestock = false) {
    // The page shown now, not the page this handler was drawn for: a tap that still
    // reaches a picker drawn on another page saves nothing.
    if (!variantChoice?.payload.url || variantChoice.payload.url !== currentUrlRef.current) {
      setVariantChoice(null);
      return;
    }
    const payload = variantChoice.payload;
    setVariantChoice(null);
    saveMetadata({
      ...payload,
      pageUrl: payload.url,
      url: variantUrl(payload.url!, variant.id, variant.url),
      title: `${payload.title?.slice(0, 497 - variant.title.length)} · ${variant.title}`,
      variantStatus: 'chosen',
      armRestock,
    });
  }

  function saveMetadata(payload: SaveMetadata) {
    if (typeof payload.url !== 'string' || typeof payload.title !== 'string') return;
    const priceMinor = parsePriceToMinor(payload.price);
    const currency =
      priceMinor !== null && payload.currency ? payload.currency.toUpperCase() : null;
    setPageTitle(payload.title);
    const callbacks = {
      onSuccess: (data: { id: string }) => {
        // Only the page the size was chosen on follows its saved address: a reply for a
        // page the user has since left must not pull the browser back to it.
        if (
          payload.variantStatus === 'chosen' &&
          payload.url &&
          followSavedVariant(payload.pageUrl, currentUrlRef.current)
        )
          webViewRef.current?.injectJavaScript(
            `location.assign(${JSON.stringify(payload.url)}); true;`,
          );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 90);
        // The size picker's bell saves the sold-out size and asks to be told when it is back.
        if (payload.armRestock) restock.arm(data.id, t('boutique.restockSaved'), params.boutiqueId);
        else
          setCelebration({
            title: payload.title ?? '',
            boutiqueName: routeName,
            savedId: data.id,
            tracked: !anaSayfaMi(payload.url ?? currentUrlRef.current),
          });
        trackEvents([
          {
            type: 'product_saved',
            payload: {
              url: payload.url,
              boutique_id: params.boutiqueId ?? null,
              variant_chosen: payload.variantStatus === 'chosen',
              restock_armed: !!payload.armRestock,
              is_home_page: anaSayfaMi(payload.url ?? currentUrlRef.current),
              is_variant_edit: !!payload.editSavedId,
              ...(params.kaynak === 'oneri' && params.oneriId
                ? { kaynak: 'oneri', oneriId: params.oneriId }
                : {}),
            },
          },
        ]);
      },
      onError: (error: Error) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const zatenKayitli = error instanceof ApiError && error.code === 'variant_already_saved';
        kayitOlmadi(zatenKayitli ? 'already_saved' : 'server_error', !!payload.editSavedId);
        showToast(
          t(zatenKayitli ? 'boutique.variantAlreadySaved' : 'boutique.saveFailed'),
          'error',
        );
      },
    };
    if (payload.editSavedId) {
      updateVariantMutation.mutate(
        { id: payload.editSavedId, url: payload.url, title: payload.title },
        callbacks,
      );
    } else {
      saveMutation.mutate(
        {
          boutiqueId: params.boutiqueId,
          url: payload.url,
          title: payload.title,
          imageUrl: payload.image ?? null,
          description: payload.description ?? null,
          priceMinor,
          currency,
        },
        callbacks,
      );
    }
  }
  function siteHatasi(
    kind: 'load' | 'http',
    url: string | undefined,
    kodlar: { statusCode?: number; errorCode?: number },
  ) {
    const host = hataAlanAdi(url);
    const kod = kodlar.statusCode ?? kodlar.errorCode ?? '';
    if (!ilkKezMi(sayilanHatalar.current, `${kind}:${kod}:${host}`)) return;
    trackWebviewError({
      boutiqueId: params.boutiqueId,
      kind,
      host,
      statusCode: kodlar.statusCode ?? null,
      errorCode: kodlar.errorCode ?? null,
      onFirstLoad: !olcumGonderildi.current,
    });
  }

  function handleNavStateChange(e: WebViewNavigation) {
    setCurrentUrl(izleriTemizle(e.url));
    setCanGoBack(e.canGoBack);
    setCanGoForward(e.canGoForward);
    setLoading(e.loading);

    if (e.title && e.title !== 'about:blank') {
      setPageTitle(e.title);
    }
  }

  const heartIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: heartIconScale.value,
      },
    ],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${loadProgress.value * 100}%`,
    opacity:
      loadProgress.value > 0 && loadProgress.value < 1 ? 1 : loadProgress.value === 1 ? 0.6 : 0,
  }));

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.topSafe} />

      {/* Butik sitesi oturum kaydında tümüyle gizli: ödeme/adres formları WebView içinde
          olduğundan metin maskesi oraya ulaşmaz. Kayıtta yalnız uygulamanın kendi çerçevesi görünür. */}
      {acilisAdresi ? (
        <PostHogMaskView style={styles.web}>
          <WebView
            ref={webViewRef}
            source={{
              uri: acilisAdresi,
            }}
            style={styles.web}
            onMessage={handleMessage}
            onNavigationStateChange={handleNavStateChange}
            onLoadProgress={({ nativeEvent }) => {
              const p = nativeEvent.progress;
              loadProgress.value = withTiming(p < 0.2 ? 0.2 : p, { duration: 200 });
              // Sayfanın çizilmeye başladığı eşik — burada açılış perdesi kalkar.
              if (p >= ILK_GORUNTU_ESIGI) {
                if (ilkCizimMs.current === null)
                  ilkCizimMs.current = Date.now() - acilisAni.current;
                setSayfaGorunur(true);
              }
            }}
            onLoadStart={() => {
              loadProgress.value = withTiming(0.1, {
                duration: 100,
              });
              // Yükleme oranı takılsa bile perde kalksın: altta sayfa çizilmişken kullanıcıyı
              // kapakla bekletmek boş beklemekten farksız.
              if (perdeZamanlayici.current) clearTimeout(perdeZamanlayici.current);
              perdeZamanlayici.current = setTimeout(() => {
                if (ilkCizimMs.current === null)
                  ilkCizimMs.current = Date.now() - acilisAni.current;
                setSayfaGorunur(true);
              }, ILK_GORUNTU_SURESI_MS);
            }}
            onLoadEnd={() => {
              loadProgress.value = withTiming(1, { duration: 150 });
              setSayfaGorunur(true); // eşiğe hiç ulaşmayan siteler için emniyet
              if (!olcumGonderildi.current) {
                olcumGonderildi.current = true;
                trackWebviewTiming({
                  boutiqueId: params.boutiqueId,
                  ilkCizimMs: ilkCizimMs.current,
                  tamYuklemeMs: Date.now() - acilisAni.current,
                });
              }
              setTimeout(() => {
                loadProgress.value = withTiming(0, {
                  duration: 400,
                });
              }, 250);
            }}
            onError={({ nativeEvent }) => {
              if (sayilacakYuklemeHatasi(nativeEvent.code))
                siteHatasi('load', nativeEvent.url, { errorCode: nativeEvent.code });
            }}
            onHttpError={({ nativeEvent }) => {
              if (nativeEvent.statusCode >= 400)
                siteHatasi('http', nativeEvent.url, { statusCode: nativeEvent.statusCode });
            }}
            injectedJavaScript={NAV_TRACK_SCRIPT}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            domStorageEnabled
            pullToRefreshEnabled={Platform.OS === 'ios'}
            // Yeni mimaride verilmezse 0 kalıyor: parmak kalkınca sayfa hemen durur, kaydırma
            // ağır hissettirir. 'normal' Safari'nin kayma hızı. Yalnız iOS: Android sürümü
            // 'normal' yazısını sayıya çevirmeden yerel tarafa gönderir, uygulama çöker.
            decelerationRate={Platform.OS === 'ios' ? 'normal' : undefined}
          />
        </PostHogMaskView>
      ) : null}

      {/* Açılış perdesi — boş krem ekran yerine butiğin kapağı ve adı durur ki
          bekleme "donmuş" değil "açılıyor" hissi versin. */}
      {(!initialUrl || !sayfaGorunur) && (
        <View style={styles.loadingOverlay}>
          {kapakGorseli ? (
            <Image
              source={{ uri: kapakGorseli }}
              style={styles.acilisKapak}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          <View style={styles.acilisIcerik}>
            {initialUrl ? (
              <ActivityIndicator color={theme.colors.gold} />
            ) : (
              <Text style={styles.acilisAd}>{t('boutique.openFailed')}</Text>
            )}
            {routeName && initialUrl ? (
              <Text style={styles.acilisAd} numberOfLines={2}>
                {t('boutique.opening', { name: routeName })}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      <VariantPicker
        variants={variantChoice?.variants ?? null}
        onClose={() => {
          kayitOlmadi('size_not_chosen', !!variantChoice?.payload.editSavedId);
          setVariantChoice(null);
        }}
        onSelect={(variant) => chooseVariant(variant)}
        onNotify={(variant) => chooseVariant(variant, true)}
      />

      <Toast
        visible={!!toast}
        message={toast?.message ?? ''}
        tone={toast?.tone ?? 'success'}
        actionLabel={toast?.actionLabel}
        onAction={toast?.onAction}
        onClose={() => setToast(null)}
        bottomOffset={160}
      />

      <CollectionPicker
        visible={!!pickerSavedId}
        savedId={pickerSavedId}
        onClose={() => setPickerSavedId(null)}
        onSuccess={(count) => {
          setToast({
            message: t('boutique.addedToCollections', { count }),
            tone: 'success',
          });
        }}
      />

      <SaveCelebration
        visible={!!celebration}
        productTitle={celebration?.title}
        boutiqueName={celebration?.boutiqueName}
        onDone={dismissCelebration}
      />

      <View style={styles.progressOverlay} pointerEvents="none">
        <Animated.View style={[styles.progressFill, progressStyle]} />
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        {/* ROW 1 — BUTIKA ENGAGEMENT (üst) */}
        <View style={styles.engageRow}>
          <View style={styles.saveOuter}>
            {/* saveOuter flex:1 ile genişliği belirliyor; sarmalayıcı da ayni genisligi
                doldursun diye alignSelf:'stretch' aliyor (Pressable öncesinde de boyle
                genisliyordu — View'in varsayilan stretch davranisiyla). */}
            <TurHedefi hedefId="webview.kalp" style={{ alignSelf: 'stretch' }}>
              <Pressable
                onPress={handleHeart}
                disabled={busy}
                style={({ pressed }) => [
                  styles.savePill,
                  isSaved ? styles.savePillSaved : styles.savePillIdle,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <View style={styles.heartHolder}>
                  {busy ? (
                    <ActivityIndicator
                      size="small"
                      color={isSaved ? theme.colors.bordo : theme.colors.cream}
                    />
                  ) : (
                    <Animated.View style={heartIconStyle}>
                      <Ionicons
                        name={isSaved ? 'heart' : 'heart-outline'}
                        size={20}
                        color={isSaved ? theme.colors.bordo : theme.colors.cream}
                      />
                    </Animated.View>
                  )}
                </View>
                <Text
                  style={[
                    styles.savePillLabel,
                    { color: isSaved ? theme.colors.bordo : theme.colors.cream },
                  ]}
                  // "BUTİKA'YA KAYDET" dar ekranlarda (iPhone SE) hapa sığmıyor;
                  // sarma yerine gerektiği kadar küçülsün.
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                >
                  {buyukHarf(isSaved ? t('boutique.saved') : t('boutique.save'), i18n.language)}
                </Text>
                {isSaved && (
                  <Ionicons
                    name="checkmark"
                    size={15}
                    color={theme.colors.gold}
                    style={{ marginLeft: 2 }}
                  />
                )}
              </Pressable>
            </TurHedefi>
            {savedRecord && (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => beginCapture(savedRecord.id)}
                style={{ paddingTop: 8, paddingBottom: 4 }}
              >
                <Text style={{ textAlign: 'center', color: theme.colors.gold, fontSize: 13 }}>
                  {t('boutique.changeVariant')}
                </Text>
              </Pressable>
            )}
            {savedRecord && (
              <RestockToggle
                item={savedRecord}
                centered
                disabled={busy || restock.pending}
                onPress={() => restock.toggle(savedRecord)}
              />
            )}
          </View>

          {/* chip sabit 48x48 boyutlu; sarmalayici stilsiz de icerige gore ayni
              boyutta olustuğundan engageRow'daki gap/hizalama degismiyor. */}
          <TurHedefi hedefId="webview.yorum">
            <Pressable
              onPress={() =>
                router.push(
                  commentsRoute({
                    boutiqueId: params.boutiqueId,
                    url: currentUrl,
                    title: pageTitle || routeName || hostname(currentUrl),
                  }),
                )
              }
              hitSlop={6}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.55 }]}
            >
              <Ionicons name="chatbubble-outline" size={20} color={theme.colors.ink} />
              {commentCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{commentCount > 99 ? '99+' : commentCount}</Text>
                </View>
              )}
            </Pressable>
          </TurHedefi>

          <TurHedefi hedefId="webview.koleksiyon">
            <Pressable
              onPress={() => {
                // The same record the heart shows as saved, however the address is spelled.
                const savedItem = savedRecord;
                if (!savedItem) {
                  setToast({
                    message: t('boutique.saveFirst'),
                    tone: 'info',
                  });
                  return;
                }
                setPickerSavedId(savedItem.id);
              }}
              hitSlop={6}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.55 }]}
            >
              <Ionicons name="albums-outline" size={20} color={theme.colors.ink} />
            </Pressable>
          </TurHedefi>
        </View>

        <View style={styles.divider} />

        {/* ROW 2 — CHROME (alt): geri / paylaş / more / kapat */}
        <View style={styles.chromeRow}>
          {/* chromeRow justifyContent:'space-between' — her sarmalayici icerige gore
              (navBtn 44x36) boyutlaniyor, aradaki bosluklar degismiyor. */}
          <TurHedefi hedefId="webview.geri">
            <Pressable
              onPress={handleSmartBack}
              hitSlop={10}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.bordo} />
              <Text style={styles.navLabel}>{t('boutique.navBack')}</Text>
            </Pressable>
          </TurHedefi>

          <TurHedefi hedefId="webview.paylas">
            <Pressable
              onPress={() => {
                // Paylaşılan adreste Butika etiketi (utm_*, butika_click) kalmaz.
                const paylasilan = izleriTemizle(currentUrl);
                Share.share({
                  message: `${pageTitle || hostname(paylasilan)}\n${paylasilan}`,
                  url: paylasilan,
                  title: pageTitle || hostname(paylasilan),
                }).catch(() => {});
                trackEvents([{ type: 'share', payload: { url: paylasilan } }]);
              }}
              hitSlop={10}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="share-outline" size={21} color={theme.colors.bordo} />
              <Text style={styles.navLabel}>{t('boutique.navShare')}</Text>
            </Pressable>
          </TurHedefi>

          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="close" size={22} color={theme.colors.bordo} />
            <Text style={styles.navLabel}>{t('boutique.navClose')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

function parsePriceToMinor(raw: string | null | undefined): number | null {
  if (!raw) return null;

  let numeric = raw.replace(/\s/g, '').replace(/[^\d.,]/g, '');

  if (!numeric) return null;

  const lastComma = numeric.lastIndexOf(',');

  const lastDot = numeric.lastIndexOf('.');

  let decimalSeparator: ',' | '.' | null = null;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    const digitsAfter = numeric.length - lastComma - 1;

    if (digitsAfter === 2) {
      decimalSeparator = ',';
    }
  } else if (lastDot >= 0) {
    const digitsAfter = numeric.length - lastDot - 1;

    if (digitsAfter === 2) {
      decimalSeparator = '.';
    }
  }

  if (decimalSeparator) {
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';

    numeric = numeric.split(thousandsSeparator).join('');

    numeric = numeric.replace(decimalSeparator, '.');
  } else {
    numeric = numeric.replace(/[.,]/g, '');
  }

  const value = Number(numeric);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.round(value * 100);
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },

  topSafe: {
    backgroundColor: theme.colors.cream,
  },

  web: {
    flex: 1,
    backgroundColor: theme.colors.cream,
  },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
  },
  // Kapak, perdenin arkasında soluk durur — marka tanınır ama yazıyı bastırmaz.
  acilisKapak: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  acilisIcerik: {
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 40,
  },
  acilisAd: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },

  // Progress bar — WebView'in alt kenarına yapışık ince altın çizgi
  progressOverlay: {
    height: 1.5,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.gold,
  },

  bottomBar: {
    backgroundColor: theme.colors.cream,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.mist,
  },

  // ROW 1 — Butika engagement (prominent, gold pill + 2 chips)
  engageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 10,
  },

  saveOuter: {
    flex: 1,
  },

  heartHolder: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Önemli: borderWidth her iki state'de aynı (1.5) — sadece renk değişir.
  // Aksi halde geçişlerde 1.5px layout kayması text'i bir frame için
  // gizliyordu (orig bug).
  savePill: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1.5,
  },

  savePillIdle: {
    backgroundColor: theme.colors.bordo,
    borderColor: theme.colors.bordo,
  },

  savePillSaved: {
    backgroundColor: theme.colors.cream,
    borderColor: theme.colors.bordo,
  },

  savePillLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    // Etiket "KAYDET"ten "BUTİKA'YA KAYDET"e uzadı: harf aralığı 2 iken
    // 375pt genişlikteki telefonlarda taşıyordu.
    letterSpacing: 1.2,
    color: theme.colors.cream,
  },

  savePillLabelSaved: {
    color: theme.colors.bordo,
  },

  chip: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.creamSoft,
  },

  badge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    color: theme.colors.cream,
    fontSize: 10,
    lineHeight: 12,
  },

  // Hairline divider between the two rows
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginHorizontal: 24,
  },

  // ROW 2 — chrome (muted, browser-like)
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },

  navBtn: {
    minWidth: 76,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  navLabel: {
    fontFamily: theme.font.body,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.bordo,
  },
});
