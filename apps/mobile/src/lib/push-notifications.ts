import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  trackPushPermission,
  trackPushPermissionChanged,
  trackPushPermissionResult,
  trackPushRegisterFailed,
} from './analytics';
import { api } from './api';
import { type IzinDegeri, izinDegeri, izinDegisimi } from './push-izni';
import { secureStorage } from './storage';

const INSTALLATION_ID_KEY = 'pushInstallationId';
const ANDROID_CHANNEL_ID = 'price-drops-v2';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function getInstallationId(): Promise<string> {
  const existing = await secureStorage.get(INSTALLATION_ID_KEY);

  if (existing) {
    return existing;
  }

  const installationId = Crypto.randomUUID();

  await secureStorage.set(INSTALLATION_ID_KEY, installationId);

  return installationId;
}

export async function registerPushDevice(): Promise<boolean> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return false;
  }

  if (Platform.OS === 'android') {
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Fiyat ve stok bildirimleri',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250],
  });
}

  const existingPermission = await Notifications.getPermissionsAsync();
  // Son açılıştan bu yana ayarlardan değiştiyse push_permission_changed (pencereden önce bakılır,
  // pencerenin cevabı "ayardan değişti" sayılmasın).
  await izinDegisikliginiKaydet(izinDegeri(existingPermission));

  let permissionStatus = existingPermission.status;
  let izin = izinDegeri(existingPermission);
  // Sistem izin penceresi yalnız karar verilmemişken (undetermined) gösterilir;
  // reddedilmişse requestPermissionsAsync pencere açmadan 'denied' döner.
  const prompted = permissionStatus === 'undetermined';

  if (permissionStatus !== 'granted') {
    const requestedPermission =
      await Notifications.requestPermissionsAsync();

    permissionStatus = requestedPermission.status;
    izin = izinDegeri(requestedPermission);
    if (prompted) trackPushPermissionResult({ result: izin, platform: Platform.OS });
    await izniSakla(izin);
  }

  trackPushPermission({ status: permissionStatus, izin, prompted, platform: Platform.OS });

  if (permissionStatus !== 'granted') {
    return false;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    trackPushRegisterFailed({ stage: 'project_id' });
    throw new Error('Expo EAS projectId bulunamadı');
  }

  let expoPushToken: string;
  try {
    expoPushToken = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
  } catch (error) {
    trackPushRegisterFailed({ stage: 'token' });
    throw error;
  }

  const installationId = await getInstallationId();

  try {
    await api.post('/push/devices', {
      installationId,
      expoPushToken,
      platform: Platform.OS,
    });
  } catch (error) {
    trackPushRegisterFailed({ stage: 'api' });
    throw error;
  }

  return true;
}

// Bu cihazda son görülen izin değeri (lib/push-izni). Kişisel bilgi değil; yalnız değişimi fark etmek için.
const SON_IZIN_KEY = 'butika.sonPushIzni';

async function izniSakla(izin: IzinDegeri) {
  try {
    await AsyncStorage.setItem(SON_IZIN_KEY, izin);
  } catch {
    // saklanamazsa bir sonraki değişim kaçar; uygulamayı etkilemez
  }
}

async function izinDegisikliginiKaydet(simdi: IzinDegeri) {
  let onceki: string | null = null;
  try {
    onceki = await AsyncStorage.getItem(SON_IZIN_KEY);
  } catch {
    return;
  }
  const degisim = izinDegisimi(onceki, simdi);
  if (degisim) trackPushPermissionChanged({ ...degisim, platform: Platform.OS });
  if (onceki !== simdi) await izniSakla(simdi);
}

/**
 * Uygulama öne geldiğinde: kullanıcı izni telefonun ayarlarından değiştirdiyse kaydeder.
 * Bu cihazda ilk kez bakılıyorsa yalnız değeri saklar, olay göndermez.
 */
export async function pushIzniniDenetle(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  try {
    await izinDegisikliginiKaydet(izinDegeri(await Notifications.getPermissionsAsync()));
  } catch {
    // ölçüm; sessizce geç
  }
}

export async function unregisterPushDevice(): Promise<void> {
  const installationId =
    await secureStorage.get(INSTALLATION_ID_KEY);

  if (!installationId) {
    return;
  }

  await api.delete(
    `/push/devices/${encodeURIComponent(installationId)}`,
  );
}