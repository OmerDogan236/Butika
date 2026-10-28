import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Boutique } from '../../src/api/queries';
import { trackBoutiqueOutboundClick } from '../../src/lib/analytics';
import { api } from '../../src/lib/api';
import { butikYolu } from '../../src/lib/butik-kaynagi';
import { urunButiginMi } from '../../src/lib/deep-link';
import { webviewRoute } from '../../src/lib/route-text';
import { theme } from '../../src/theme';

// butika.ai/b/<butik> linki (Instagram hikâyesi, profil linki). Uygulama yüklüyse işletim sistemi
// linki buraya getirir: butiğin sayfası açılır. ?urun=<adres> varsa ve adres butiğin kendi
// sitesindeyse ürün, butiğin vitrininden girilmiş gibi uygulama içi tarayıcıda açılır.
// Butik adı → id listesi web sayfasıyla ortak: butika.ai/b/butikler.json.
const BUTIK_LISTESI = 'https://butika.ai/b/butikler.json';

type ListeKaydi = { id?: unknown };

export default function ButikLinki() {
  const { slug, urun } = useLocalSearchParams<{ slug: string; urun?: string }>();
  const router = useRouter();

  useEffect(() => {
    let iptal = false;
    async function ac() {
      const anahtar = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const yanit = await fetch(BUTIK_LISTESI);
      const liste = (await yanit.json()) as Record<string, ListeKaydi>;
      const kayit = Object.prototype.hasOwnProperty.call(liste, anahtar) ? liste[anahtar] : null;
      const id = typeof kayit?.id === 'string' ? kayit.id : null;
      if (iptal) return;
      if (!id) {
        router.replace('/');
        return;
      }
      const urunAdresi = typeof urun === 'string' ? urun.trim() : '';
      if (urunAdresi) {
        const butik = await api.get<Boutique>(`/boutiques/${id}`);
        if (iptal) return;
        if (urunButiginMi(urunAdresi, butik.url)) {
          const iz = trackBoutiqueOutboundClick({
            boutiqueId: butik.id,
            boutiqueName: butik.name,
            sourceScreen: 'link',
            destinationUrl: urunAdresi,
            category: butik.categoryIds?.[0] ?? null,
            entrySource: 'link',
          });
          router.replace(
            webviewRoute({
              iz,
              boutiqueId: butik.id,
              url: urunAdresi,
              name: butik.name,
              cover: butik.coverImageUrl,
            }),
          );
          return;
        }
      }
      router.replace(butikYolu(id, 'link'));
    }
    ac().catch(() => {
      if (!iptal) router.replace('/');
    });
    return () => {
      iptal = true;
    };
  }, [slug, urun, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={theme.colors.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.cream,
  },
});
