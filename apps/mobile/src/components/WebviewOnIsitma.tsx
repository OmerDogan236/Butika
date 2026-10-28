import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Görünmez, boş bir WebView. Tek işi işletim sisteminin tarayıcı motorunu uygulama
 * açılırken hazırlamak: ilk butiğe girildiğinde motorun sıfırdan kurulması 0,3–0,8 sn
 * alıyordu, bu maliyet artık kullanıcı beklerken değil, açılışta ödeniyor.
 *
 * Boyutu 1×1 ve dokunulamaz; ağa hiç çıkmaz (boş HTML).
 *
 * NOT: `source={{ uri: 'about:blank' }}` KULLANMA — react-native-webview bunu dosya adresi
 * sanıp `loadFileURL:` çağırıyor ve uygulama açılışta çöküyor (16 Eyl, iOS).
 */
export function WebviewOnIsitma() {
  const [goster, setGoster] = useState(false);

  // Açılışın kendisini yavaşlatmamak için ilk çizimden biraz sonra bağlanır.
  useEffect(() => {
    const zamanlayici = setTimeout(() => setGoster(true), 800);
    return () => clearTimeout(zamanlayici);
  }, []);

  if (!goster) return null;
  return (
    <View style={styles.kutu} pointerEvents="none" accessibilityElementsHidden>
      <WebView source={{ html: '<html><body></body></html>' }} javaScriptEnabled />
    </View>
  );
}

const styles = StyleSheet.create({
  kutu: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -10, left: -10 },
});
