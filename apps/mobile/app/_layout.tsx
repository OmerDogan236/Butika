import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Newsreader_400Regular, Newsreader_500Medium } from '@expo-google-fonts/newsreader';
import { RobotoMono_400Regular, RobotoMono_500Medium } from '@expo-google-fonts/roboto-mono';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { PostHogProvider } from 'posthog-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { siparisleriOnceden } from '../src/api/queries';
import { tarzTestiniGonder } from '../src/api/tarz-testi';
import { WebviewOnIsitma } from '../src/components/WebviewOnIsitma';
import { TurKatmani } from '../src/components/tur/TurKatmani';
import {
  acilisKaynagiAl,
  pushAcilisiniBildir,
  sogukPushKontrolBitti,
} from '../src/lib/acilis-kaynagi';
import {
  posthog,
  trackAppForegrounded,
  trackBoutiqueOutboundClick,
  trackPushOpened,
  trackPushReceived,
} from '../src/lib/analytics';
import { api } from '../src/lib/api';
import { type DuyuruHedefi, duyuruHedefi } from '../src/lib/bildirim-hedefi';
import { butikYolu } from '../src/lib/butik-kaynagi';
import { magazayiAc } from '../src/lib/magaza-ac';
import { pushIzniniDenetle, registerPushDevice } from '../src/lib/push-notifications';
import { queryClient } from '../src/lib/query-client';
import { webviewRoute } from '../src/lib/route-text';
import { useAuthStore } from '../src/stores/auth';
import { useKisiselStore } from '../src/stores/kisisel';
import { useLocaleStore } from '../src/stores/locale';
import { useOnboardingStore } from '../src/stores/onboarding';
import { useTurStore } from '../src/stores/tur';
import { acilistaProfilMi, useVitrinStore } from '../src/stores/vitrin';
import { theme } from '../src/theme';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const authStatus = useAuthStore((s) => s.status);
  const onboardingStatus = useOnboardingStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();
  // Gezinme kurulmadan yönlendirme Android'de "navigate before mounting the Root Layout"
  // hatası veriyordu (açılışta zamanlama denk gelince): önce yapı hazır olsun.
  const gezinmeHazir = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (!gezinmeHazir) return;
    if (authStatus === 'loading' || onboardingStatus === 'unknown') return;
    const first = segments[0];
    const onAuth = first === 'auth';
    const onOnboarding = first === 'onboarding';

    if (authStatus === 'unauthenticated') {
      if (!onAuth) router.replace('/auth');
      return;
    }
    // authenticated
    if (onboardingStatus === 'pending') {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }
    // authenticated + onboarded
    if (onAuth || onOnboarding) router.replace('/(tabs)');
  }, [gezinmeHazir, authStatus, onboardingStatus, segments, router]);

  // Girişte ERKEK seçilince uygulama renkler için yeniden yüklenir; sonra Profil açılsın.
  const profilBakildi = useRef(false);
  useEffect(() => {
    if (!gezinmeHazir || profilBakildi.current) return;
    if (authStatus !== 'authenticated' || onboardingStatus !== 'completed') return;
    profilBakildi.current = true;
    void acilistaProfilMi().then((git) => {
      if (git) router.replace('/(tabs)/saved');
    });
  }, [gezinmeHazir, authStatus, onboardingStatus, router]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // 1.2.4: başlıklar dik Newsreader (eğik Fraunces kalktı), küçük etiketler Roboto Mono.
    Newsreader_400Regular,
    Newsreader_500Medium,
    RobotoMono_400Regular,
    RobotoMono_500Medium,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  const initAuth = useAuthStore((s) => s.init);
  const initOnboarding = useOnboardingStore((s) => s.init);
  const initLocale = useLocaleStore((s) => s.init);
  const turInit = useTurStore((s) => s.init);

  const authStatus = useAuthStore((s) => s.status);
  const userId = useAuthStore((s) => s.user?.id);
  const onboardingStatus = useOnboardingStore((s) => s.status);

  const router = useRouter();
  const rootSegments = useSegments();
  const rootNavigationState = useRootNavigationState();

  const handledNotificationRef = useRef<string | null>(null);
  const trackedOpenRef = useRef<string | null>(null);
  const [pendingNotificationResponse, setPendingNotificationResponse] =
    useState<Notifications.NotificationResponse | null>(null);

  useEffect(() => {
    initOnboarding();
    // Önce dil/pazar hazır olsun (sabit TR), sonra auth.
    initLocale().finally(() => initAuth());
  }, [initLocale, initAuth, initOnboarding]);

  useEffect(() => {
    void turInit();
  }, [turInit]);

  // KADIN | ERKEK vitrini (renkleri index.js açılışta ayarlar).
  useEffect(() => {
    void useVitrinStore.getState().init();
  }, []);

  // Kişisel akış durumu kullanıcı başına okunur; telefonda bekleyen test cevabı varsa yeniden gönderilir.
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      useKisiselStore.getState().sifirla(); // çıkış: sonraki kullanıcı bu durumu görmesin
      return;
    }
    if (authStatus !== 'authenticated' || !userId) return;
    void useKisiselStore.getState().init(userId, tarzTestiniGonder);
  }, [authStatus, userId]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !userId) {
      return;
    }

    // Pilot bilgisi önbellekte hazır olsun (etiketli butik linki; webview ağ beklemez).
    siparisleriOnceden();

    registerPushDevice().catch((error) => {
      if (__DEV__) {
        console.warn('[push] device registration failed', error);
      }
    });
  }, [authStatus, userId]);

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
    };
    const received = Notifications.addNotificationReceivedListener((notification) => {
      invalidate();
      const type = notification.request.content.data?.type;
      trackPushReceived({ type: typeof type === 'string' ? type : null });
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) invalidate();
    });
    return () => {
      received.remove();
      foreground.remove();
    };
  }, [userId]);

  // Arka plandan dönüş = app_foregrounded (soğuk açılış app_open'la sayılır). Bildirim dokunuşu
  // ve bağlantı, uygulama öne geldikten hemen sonra bildirildiği için kaynak biraz beklenerek okunur.
  useEffect(() => {
    let onceki = AppState.currentState;
    let zamanlayici: ReturnType<typeof setTimeout> | null = null;
    const abonelik = AppState.addEventListener('change', (state) => {
      const arkadanGeldi = state === 'active' && onceki === 'background';
      onceki = state;
      if (!arkadanGeldi) return;
      // Kullanıcı bildirim iznini telefonun ayarlarından değiştirip dönmüş olabilir.
      void pushIzniniDenetle();
      // Vitrin ayarları (seçki başlığı, en son sürüm) admin'den değişmiş olabilir.
      void queryClient.invalidateQueries({ queryKey: ['vitrin-ayarlari'] });
      if (zamanlayici) clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => trackAppForegrounded(acilisKaynagiAl()), 1000);
    });
    return () => {
      abonelik.remove();
      if (zamanlayici) clearTimeout(zamanlayici);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const captureNotificationResponse = (
      response: Notifications.NotificationResponse,
      coldStart: boolean,
    ) => {
      if (!active) return;

      // Aynı dokunuş hem dinleyiciden hem getLastNotificationResponseAsync'ten
      // gelebilir; PostHog'a bir kez yaz.
      const notificationId = response.notification.request.identifier;
      if (trackedOpenRef.current !== notificationId) {
        trackedOpenRef.current = notificationId;
        const data = response.notification.request.content.data;
        pushAcilisiniBildir(data);
        trackPushOpened({
          type: typeof data?.type === 'string' ? data.type : null,
          eventId: typeof data?.eventId === 'string' ? data.eventId : null,
          target: typeof data?.target === 'string' ? data.target : null,
          coldStart,
          campaign: typeof data?.campaign === 'string' ? data.campaign : null,
        });
      }

      setPendingNotificationResponse(response);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      captureNotificationResponse(response, false),
    );

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!active || !response) return;

        captureNotificationResponse(response, true);
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('[push] last notification response failed', error);
        }
      })
      // app_open, uygulamayı bir bildirimin açıp açmadığı belli olunca gider.
      .finally(sogukPushKontrolBitti);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pendingNotificationResponse) {
      return;
    }

    if (!rootNavigationState?.key) {
      return;
    }

    if (
      authStatus !== 'authenticated' ||
      onboardingStatus === 'unknown' ||
      onboardingStatus === 'pending'
    ) {
      return;
    }

    const firstSegment = rootSegments[0] as string | undefined;

    // Cold start sırasında index/auth/onboarding yönlendirmelerinin
    // tamamen bitmesini bekle.
    if (!firstSegment || firstSegment === 'auth' || firstSegment === 'onboarding') {
      return;
    }

    const notificationId = pendingNotificationResponse.notification.request.identifier;

    if (handledNotificationRef.current === notificationId) {
      setPendingNotificationResponse(null);
      return;
    }

    const data = pendingNotificationResponse.notification.request.content.data;

    // Duyuru: admin'de seçilen hedef (Fırsat, butik, kategori, mağaza…) açılır.
    const hedef = duyuruHedefi(data);
    if (hedef) {
      const timer = setTimeout(() => {
        handledNotificationRef.current = notificationId;
        duyuruHedefineGit(hedef);
        setPendingNotificationResponse(null);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }, 250);
      return () => clearTimeout(timer);
    }

    if (data?.type !== 'price_drop' && data?.type !== 'back_in_stock') {
      setPendingNotificationResponse(null);
      return;
    }

    const boutiqueId = typeof data.boutiqueId === 'string' ? data.boutiqueId : null;

    const sourceUrl = typeof data.sourceUrl === 'string' ? data.sourceUrl : null;

    const productTitle = typeof data.productTitle === 'string' ? data.productTitle : undefined;

    if (!boutiqueId || !sourceUrl) {
      setPendingNotificationResponse(null);

      Notifications.clearLastNotificationResponseAsync().catch(() => {});

      return;
    }

    const timer = setTimeout(() => {
      handledNotificationRef.current = notificationId;
      if (typeof data.eventId === 'string') {
        void api
          .patch(`/notifications/events/${encodeURIComponent(data.eventId)}/read`)
          .then(() => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }))
          .catch(() => {});
      }
      const iz = trackBoutiqueOutboundClick({
        boutiqueId,
        boutiqueName: null,
        sourceScreen: 'notification',
        destinationUrl: sourceUrl,
      });
      router.push(webviewRoute({ boutiqueId, url: sourceUrl, name: productTitle, iz }));

      setPendingNotificationResponse(null);

      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [
    authStatus,
    onboardingStatus,
    pendingNotificationResponse,
    rootNavigationState?.key,
    rootSegments,
    router,
    userId,
  ]);
  function duyuruHedefineGit(hedef: DuyuruHedefi) {
    if (hedef.tur === 'sekme') router.navigate(hedef.yol);
    else if (hedef.tur === 'kategori')
      router.navigate({ pathname: '/(tabs)', params: { kategori: hedef.id } });
    else if (hedef.tur === 'butik') router.push(butikYolu(hedef.id, 'bildirim'));
    else void magazayiAc().catch(() => {});
  }

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.cream }}>
      <SafeAreaProvider>
        <PostHogProvider client={posthog} autocapture={{ captureTouches: false }}>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="dark" />
            <AuthGate />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.colors.cream },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="auth" />
              <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="boutique/[id]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen name="webview" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="paylasim"
                options={{ presentation: 'transparentModal', animation: 'fade' }}
              />
              <Stack.Screen
                name="search"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="comments"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="suggest"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
              <Stack.Screen
                name="collection/new"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="collection/[id]/edit"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="profile/edit"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="profile/settings"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="tarz-testi"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="detayli-test"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="kisisel"
                options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
              />
            </Stack>
            <TurKatmani />
            <WebviewOnIsitma />
          </QueryClientProvider>
        </PostHogProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
