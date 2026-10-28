import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type StorageKey = 'accessToken' | 'refreshToken' | 'pushInstallationId' | 'apiUrl';

const isAvailable = SecureStore.isAvailableAsync;

// iOS'ta oturum anahtarları, paylaşım menüsündeki "Butika" penceresiyle (targets/paylas)
// ortak bir anahtarlıkta tutulur; pencere Instagram'dan çıkmadan kaydı bu anahtarla yapar.
// Grup adı targets/paylas/expo-target.config.js ve app.json entitlements ile aynı olmalı.
export const ORTAK_ANAHTARLIK = '267U2P4925.app.butika.ortak';
const ORTAK: readonly StorageKey[] = ['accessToken', 'refreshToken', 'apiUrl'];

function secenek(key: StorageKey): SecureStore.SecureStoreOptions | undefined {
  return Platform.OS === 'ios' && ORTAK.includes(key) ? { accessGroup: ORTAK_ANAHTARLIK } : undefined;
}

export const secureStorage = {
  async get(key: StorageKey): Promise<string | null> {
    const ortak = secenek(key);
    if (!ortak) return SecureStore.getItemAsync(key);
    const deger = await SecureStore.getItemAsync(key, ortak).catch(() => null);
    if (deger !== null) return deger;
    // 1.2.3 ve öncesi anahtarı uygulamanın kendi grubuna yazıyordu: bir kez ortak gruba taşı,
    // yoksa güncellemeden sonra kullanıcı oturumdan düşer.
    const eski = await SecureStore.getItemAsync(key);
    if (eski !== null) {
      await SecureStore.setItemAsync(key, eski, ortak).catch(() => undefined);
    }
    return eski;
  },
  async set(key: StorageKey, value: string): Promise<void> {
    const ortak = secenek(key);
    if (!ortak) return SecureStore.setItemAsync(key, value);
    try {
      await SecureStore.setItemAsync(key, value, ortak);
    } catch {
      // Ortak anahtarlık yetkisi yoksa (ör. imzasız geliştirme derlemesi) eski yerine yaz.
      await SecureStore.setItemAsync(key, value);
    }
  },
  async delete(key: StorageKey): Promise<void> {
    const ortak = secenek(key);
    if (ortak) await SecureStore.deleteItemAsync(key, ortak).catch(() => undefined);
    await SecureStore.deleteItemAsync(key);
  },
  async available(): Promise<boolean> {
    try {
      return await isAvailable();
    } catch {
      return false;
    }
  },
};
