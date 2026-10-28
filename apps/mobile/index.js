// `@expo/metro-runtime` ilk içe aktarma olmalı (expo-router/entry-classic ile aynı).
import '@expo/metro-runtime';

import { colors, erkekRenkleri } from '@butika/design-tokens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { useEffect, useState } from 'react';

// KADIN | ERKEK renkleri: uygulamadaki stiller dosyalar yüklenirken bir kez okunur. Erkek
// seçiliyse renkler ekranlar yüklenmeden ÖNCE değiştirilir, sonra uygulama yüklenir.
// Geçişte uygulama kendini yeniden yükler (bkz. src/stores/vitrin.ts).
const ANAHTAR = 'butika.vitrin.cinsiyet';

function Baslatici() {
  const [hazir, setHazir] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ANAHTAR)
      .catch(() => null)
      .then((cinsiyet) => {
        if (cinsiyet === 'erkek') Object.assign(colors, erkekRenkleri);
        setHazir(true);
      });
  }, []);
  if (!hazir) return null;
  const { App } = require('expo-router/build/qualified-entry');
  return <App />;
}

renderRootComponent(Baslatici);
