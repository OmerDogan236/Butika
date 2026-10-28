import { Ionicons } from '@expo/vector-icons';
import { PlatformPressable } from '@react-navigation/elements';
import { Image } from 'expo-image';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnreadNotificationCount } from '../../src/api/notifications';
import { FirsatIkonu } from '../../src/components/FirsatIkonu';
import { TurHedefi } from '../../src/components/tur/TurHedefi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { theme } from '../../src/theme';

const MASCOT = require('../../assets/butikcan.png');

export default function TabLayout() {
  const { t, i18n } = useTranslation();
  // Okunmamış fiyat düşüşü / stok haberleri Profil sekmesinde bordo rozetle görünür.
  const okunmamis = useUnreadNotificationCount().data?.count ?? 0;
  // Android kenardan kenara çizer: sabit 72 yükseklikte sistem gezinme çizgisi
  // sekme yazılarının üstüne biniyordu ("BUTİKCAN" üstü çizili görünüyordu).
  // Çizginin payı kadar uzatıp yazıları yukarı alıyoruz. iOS görünümü aynı kalır.
  const insets = useSafeAreaInsets();
  const altBosluk = Platform.OS === 'android' ? insets.bottom : 0;
  return (
    <Tabs
      // Profil en solda ama uygulama Keşfet'le açılır.
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.bordo,
        tabBarInactiveTintColor: theme.colors.inkFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.cream,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: theme.colors.mist,
          height: 72 + altBosluk,
          paddingTop: 10,
          ...(altBosluk > 0 ? { paddingBottom: altBosluk } : null),
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 10,
          // 1.6 harf aralığında "KOLEKSIYON"/"COLLECTIONS" sekmeye sığmayıp
          // "KOLEKSIY…" diye kesiliyordu (Android'de yakalandı).
          letterSpacing: 0.8,
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: buyukHarf(t('tabs.saved'), i18n.language),
          tabBarAccessibilityLabel: t('tabs.saved'),
          // 1.2.4: Kayıtlı → Profil ("Senin Butika'n"); en solda, kişi simgesi.
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={20} color={color} />
          ),
          tabBarBadge: okunmamis > 0 ? (okunmamis > 9 ? '9+' : okunmamis) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.bordo,
            color: theme.colors.blush,
            fontFamily: 'Inter_500Medium',
            fontSize: 10,
          },
          // Tur ipucu ("Kaydettiklerin") bu sekmenin TAMAMINI — kişi + PROFİL
          // etiketi — gostersin diye burasi sarilir. Sekmenin kendi butonu
          // DEGISTIRILMEZ: `PlatformPressable` react-navigation'in varsayilan
          // sekme butonudur (bkz. BottomTabItem `renderButtonDefault`) ve gelen
          // butun props — onPress, onLongPress, role/aria-*, android_ripple,
          // pressOpacity, style — oldugu gibi ona aktarilir. Yalnizca ICERIK
          // olcum icin bir View'e alinir; dokunma, gecis, renkler, etiket
          // bicimi ve erisilebilirlik aynen kalir.
          tabBarButton: ({ children, ...butonProps }) => (
            <PlatformPressable {...butonProps}>
              <TurHedefi hedefId="kayitli.alan" style={styles.sekmeHedefi}>
                {children}
              </TurHedefi>
            </PlatformPressable>
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: buyukHarf(t('tabs.showcase'), i18n.language),
          tabBarAccessibilityLabel: t('tabs.showcase'),
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={20} color={color} />,
        }}
      />
      {/* Eski Profil sekmesi: artık indirimdeki butikler. */}
      <Tabs.Screen
        name="firsat"
        options={{
          title: buyukHarf(t('tabs.deals'), i18n.language),
          tabBarAccessibilityLabel: t('tabs.deals'),
          tabBarIcon: ({ color }) => <FirsatIkonu color={color} />,
        }}
      />
      <Tabs.Screen
        name="butikcan"
        options={{
          title: buyukHarf(t('tabs.butikcan'), i18n.language),
          tabBarAccessibilityLabel: t('tabs.butikcan'),
          tabBarIcon: ({ focused }) => (
            <Image
              source={MASCOT}
              style={{ width: 30, height: 30, opacity: focused ? 1 : 0.55 }}
              contentFit="contain"
            />
          ),
        }}
      />
      {/* Koleksiyonlar 1.2.4'ten beri Profil'in içinde; ekran eski bağlantılar için kalır. */}
      <Tabs.Screen name="collections" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Sekme butonunun kendisi zaten `alignItems: 'center'` bir sutun; araya giren
  // bu View de ayni hizalamayi kullanir ki simge ile etiketin duzeni degismesin.
  sekmeHedefi: { alignItems: 'center' },
});
