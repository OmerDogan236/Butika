import { type ReactNode, useCallback, useEffect, useRef } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTurStore } from '../../stores/tur';
import { olcumuDuzelt } from '../../tur/olcum';

interface Props {
  /** adimlar.ts icindeki hedefId ile birebir ayni olmali */
  hedefId: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Hedef su anda GERCEKTEN gorunur/etkilesimli mi? Varsayilan `true`.
   * `false` verilirse olcum yapilmaz VE varsa eski kayit silinir — yoksa
   * gorunmez bir butonun eski olcumu sozlukte kalir ve tur bos bir
   * dikdortgeni aydinlatir (Vitrin'deki "Butik oner" FAB'i boyleydi).
   */
  etkin?: boolean;
}

/**
 * Anlatilacak butonu sarar ve ekrandaki yerini olcup store'a bildirir.
 * Gorunumu DEGISTIRMEZ — sadece bir View ekler.
 * Ekrandan kalkarken kaydini siler; boylece o adim sessizce atlanir.
 */
export function TurHedefi({ hedefId, children, style, etkin = true }: Props) {
  const ref = useRef<View>(null);
  const montajli = useRef(true);
  const hedefKaydet = useTurStore((s) => s.hedefKaydet);
  const hedefSil = useTurStore((s) => s.hedefSil);
  // Her artisinda yeniden olculur; bkz. asagidaki efekt.
  const olcumTazeleme = useTurStore((s) => s.olcumTazeleme);
  // Android'de `measureInWindow` y'den durum cubugunu cikariyor; geri ekliyoruz.
  // Bkz. `olcumuDuzelt` icindeki gerekce.
  const ustInset = useSafeAreaInsets().top;

  const olc = useCallback(() => {
    if (!etkin) return;
    ref.current?.measureInWindow((x, y, genislik, yukseklik) => {
      // Henuz yerlesmemis olcum (0 boyut) kaydedilmez — ok bosluga bakmasin.
      if (genislik <= 0 || yukseklik <= 0) return;
      // Unmount sonrasi gelen asenkron olcum silinmis hedefi geri yazmamalidir.
      if (!montajli.current) return;
      // Depoda DAIMA gercek pencere koordinati dursun; katman duzeltme bilmesin.
      hedefKaydet(hedefId, olcumuDuzelt({ x, y, genislik, yukseklik }, Platform.OS, ustInset));
    });
  }, [etkin, hedefId, hedefKaydet, ustInset]);

  useEffect(() => {
    montajli.current = true;
    return () => {
      montajli.current = false;
      hedefSil(hedefId);
    };
  }, [hedefId, hedefSil]);

  // Iki durumda calisir:
  //  1) `etkin` degisti — kapaninca kaydi sil, acilinca yeniden olc. Gorunurluk
  //     degisirken yerlesim degismedigi icin `onLayout` tekrar atesler garantisi yok.
  //  2) `olcumTazeleme` artti — `TurKatmani` her adim degisiminde arttirir, boylece
  //     bir adim gosterilmeden hemen once o hedefin konumu TAZE olur.
  //
  // Bu neden gerekli: `onLayout` yalnizca gorunumun KENDI ebeveyni icindeki
  // yerlesimi degisince atesler. `SafeAreaView edges={['top']}` ust guvenli alan
  // boslugunu ilk yerlesimden SONRA uygular; icerik ~60 px asagi kayar ama derinde
  // duran bir sarmalayicinin ebeveyni icindeki yeri degismedigi icin `onLayout`
  // tekrar ATESLEMEZ ve depodaki kayit eski (yukaridaki) konumda kalirdi.
  useEffect(() => {
    if (!etkin) {
      hedefSil(hedefId);
      return;
    }
    // `olcumTazeleme` sadece tetikleyici; degeri kullanilmiyor ama bagimlilik.
    void olcumTazeleme;
    olc();
  }, [etkin, hedefId, hedefSil, olc, olcumTazeleme]);

  return (
    <View ref={ref} style={style} onLayout={olc} collapsable={false}>
      {children}
    </View>
  );
}
