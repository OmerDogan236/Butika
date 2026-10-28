import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTurStore } from '../../stores/tur';
import { theme } from '../../theme';
import { gorunurAdimlar } from '../../tur/adimlar';

const PERDE = 'rgba(10, 10, 10, 0.62)';
const BOSLUK = 8; // hedefin cevresinde birakilan nefes payi
const BALONCUK_GENISLIK = 280;
const OK_BOYU = 12;
// Hedefsiz kalan turu kapatmadan once beklenen sure. Bir hedefin yeniden
// olculmesi (unmount/remount, yeniden yerlesim) bir-iki kare surer; hemen
// kapatirsak tur gecici bir bosluk yuzunden bosuna kapanir.
const HEDEFSIZ_TOLERANS_MS = 350;

export function TurKatmani() {
  const { t } = useTranslation();
  const aktifTur = useTurStore((s) => s.aktifTur);
  const aktifAdimIndeksi = useTurStore((s) => s.aktifAdimIndeksi);
  const hedefler = useTurStore((s) => s.hedefler);
  const sonrakiAdim = useTurStore((s) => s.sonrakiAdim);
  const turuAtla = useTurStore((s) => s.turuAtla);
  const olcumleriTazele = useTurStore((s) => s.olcumleriTazele);

  const adimlar = aktifTur ? gorunurAdimlar(aktifTur, hedefler) : [];
  const adim = adimlar[aktifAdimIndeksi];
  const hedef = adim ? hedefler[adim.hedefId] : undefined;
  const gosterilebilir = aktifTur !== null && adim !== undefined && hedef !== undefined;

  // Bir adim gosterilmeden ONCE hedefleri yeniden olctur. Sabit bir gecikmeye
  // guvenmek yerine adim degisimine bagli, deterministik tetikleme.
  //
  // Cozdugu hata: `onLayout` bir gorunumun KENDI ebeveyni icindeki yerlesimi
  // degisince atesler. `SafeAreaView edges={['top']}` ust guvenli alan boslugunu
  // ilk yerlesimden sonra uygular ve butun icerigi ~60 px asagi iter; derinde
  // duran hedefin ebeveyni icindeki yeri degismedigi icin `onLayout` tekrar
  // ateslemez, kayit bayat kalir ve ok butonun ~60 px yukarisini (durum
  // cubugundaki batarya simgesini) aydinlatirdi.
  //
  // Sonsuz dongu yok: tetikleyici yalnizca [aktifTur, aktifAdimIndeksi]; olcum
  // sonucu bunlarin ikisini de degistirmez, en fazla `hedefler`i gunceller.
  // Ustelik `hedefKaydet` ayni dort deger geldiginde durumu hic degistirmez.
  useEffect(() => {
    if (aktifTur === null) return;
    // `aktifAdimIndeksi` bilerek bagimlilik: degeri kullanilmiyor ama HER adim
    // degisiminde bu efekt yeniden calismali.
    void aktifAdimIndeksi;
    olcumleriTazele();
  }, [aktifTur, aktifAdimIndeksi, olcumleriTazele]);

  // Tur acikken gosterilecek adim kalmadiysa (ornek: butik sitesinde geri tusu →
  // ekran unmount → alti hedef birden silinir) katman kendini gizliyordu ama
  // `aktifTur` doluydu. O andan sonra `turuBaslat` "baska tur acik" diye erken
  // donuyor ve oturum boyunca hicbir tur acilamiyordu. Burada durumu da kapatiyoruz.
  //
  // Yaris tuzagi: tur ilk acildiginda hedefler henuz olculmemis olabilir. Iki
  // korumamiz var — (1) `turuBaslat` zaten en az bir olculmus hedef sart kosuyor,
  // yani tur hicbir zaman hedefsiz acilmaz; (2) yine de kapatmaya karar vermeden
  // once tolerans suresi bekleyip store'un TAZE halini yeniden okuyoruz.
  useEffect(() => {
    if (aktifTur === null || gosterilebilir) return;
    const zamanlayici = setTimeout(() => {
      const s = useTurStore.getState();
      if (s.aktifTur === null) return;
      const kalan = gorunurAdimlar(s.aktifTur, s.hedefler);
      const halaVar = kalan[s.aktifAdimIndeksi];
      if (halaVar && s.hedefler[halaVar.hedefId]) return; // bu arada geri geldi
      s.turuAtla();
    }, HEDEFSIZ_TOLERANS_MS);
    return () => clearTimeout(zamanlayici);
  }, [aktifTur, gosterilebilir]);

  if (!aktifTur || !adim || !hedef) return null;

  const { width: EKRAN_G, height: EKRAN_Y } = Dimensions.get('window');

  const delikUst = hedef.y - BOSLUK;
  const delikSol = hedef.x - BOSLUK;
  const delikGenislik = hedef.genislik + BOSLUK * 2;
  const delikYukseklik = hedef.yukseklik + BOSLUK * 2;
  const delikAlt = delikUst + delikYukseklik;

  // Baloncuk hedefin altina; altta yer yoksa ustune.
  const altaSigar = delikAlt + 160 < EKRAN_Y;
  const baloncukSol = Math.min(
    Math.max(12, hedef.x + hedef.genislik / 2 - BALONCUK_GENISLIK / 2),
    EKRAN_G - BALONCUK_GENISLIK - 12,
  );
  const okSol = hedef.x + hedef.genislik / 2 - baloncukSol - OK_BOYU / 2;

  // "Atla" hedefin KARSI yarisina konur. Sabit sag-ustte durdugunda, hedef
  // ekranin ustundeyse (Kayitli'nin baslik blogu, Koleksiyon'un sag ust `+`)
  // deligin icine — yani kararmamis krem zemine — dusuyordu: krem ustune krem
  // yazi okunmuyor, ustelik hedefin ustune biniyordu.
  const hedefMerkezY = hedef.y + hedef.yukseklik / 2;
  const atlaAltta = hedefMerkezY < EKRAN_Y / 2;

  return (
    <Animated.View
      style={StyleSheet.absoluteFill}
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      pointerEvents="box-none"
    >
      {/* Katmanin her yerine dokunmak ilerletir. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={sonrakiAdim}>
        {/* Karartma dort dikdortgenle — react-native-svg kurulu degil, maske yok. */}
        <View
          style={[styles.perde, { top: 0, left: 0, right: 0, height: Math.max(0, delikUst) }]}
        />
        <View style={[styles.perde, { top: delikAlt, left: 0, right: 0, bottom: 0 }]} />
        <View
          style={[
            styles.perde,
            { top: delikUst, left: 0, width: Math.max(0, delikSol), height: delikYukseklik },
          ]}
        />
        <View
          style={[
            styles.perde,
            {
              top: delikUst,
              left: delikSol + delikGenislik,
              right: 0,
              height: delikYukseklik,
            },
          ]}
        />
        {/* Hedefin cevresine ince altin cerceve */}
        <View
          style={[
            styles.cerceve,
            { top: delikUst, left: delikSol, width: delikGenislik, height: delikYukseklik },
          ]}
        />
      </Pressable>

      {/* Baloncugun govdesi de dokunulabilir olmali — tasarim geregi ekranin
          her yeri ilerletmeli, sadece kucuk "Ileri" butonu degil. Kardes
          Pressable'in dokunma alani baloncuge sizmadigi icin baloncugu
          kendisi de bir Pressable. Ic ice basilabilirlerde "Ileri" kendi
          dokunusunu once alir, cakisma olmaz. */}
      <Pressable
        onPress={sonrakiAdim}
        style={[
          styles.baloncuk,
          { left: baloncukSol, width: BALONCUK_GENISLIK },
          altaSigar ? { top: delikAlt + OK_BOYU } : { bottom: EKRAN_Y - delikUst + OK_BOYU },
        ]}
      >
        <View
          style={[
            styles.ok,
            { left: Math.min(Math.max(12, okSol), BALONCUK_GENISLIK - 24) },
            altaSigar ? { top: -OK_BOYU / 2 } : { bottom: -OK_BOYU / 2 },
          ]}
        />
        <Text style={styles.baslik}>{t(adim.baslikAnahtari)}</Text>
        <Text style={styles.metin}>{t(adim.metinAnahtari)}</Text>
        <View style={styles.altSatir}>
          <Text style={styles.sayac}>
            {aktifAdimIndeksi + 1}/{adimlar.length}
          </Text>
          <Pressable onPress={sonrakiAdim} hitSlop={10} style={styles.ileriBtn}>
            <Text style={styles.ileriMetin}>{t('tur.ileri')}</Text>
          </Pressable>
        </View>
      </Pressable>

      <Pressable
        onPress={turuAtla}
        hitSlop={12}
        style={[styles.atlaBtn, atlaAltta ? { bottom: 44 } : { top: 56 }]}
      >
        <Text style={styles.atlaMetin}>{t('tur.atla')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  perde: { position: 'absolute', backgroundColor: PERDE },
  cerceve: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.gold,
  },
  baloncuk: {
    position: 'absolute',
    backgroundColor: theme.colors.cream,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  ok: {
    position: 'absolute',
    width: OK_BOYU,
    height: OK_BOYU,
    backgroundColor: theme.colors.cream,
    transform: [{ rotate: '45deg' }],
  },
  baslik: {
    fontFamily: theme.font.displayMedium,
    fontSize: 17,
    color: theme.colors.ink,
  },
  metin: {
    fontFamily: theme.font.body,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.inkMute,
  },
  altSatir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sayac: {
    fontFamily: theme.font.bodyMedium,
    fontSize: 12,
    letterSpacing: 1,
    color: theme.colors.inkFaint,
  },
  ileriBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: theme.colors.gold,
  },
  ileriMetin: {
    fontFamily: theme.font.bodyMedium,
    fontSize: 14,
    color: theme.colors.cream,
  },
  atlaBtn: {
    position: 'absolute',
    right: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    // Koyu hap: karsi yarida da olsa "Atla" acik bir zemine denk gelirse
    // (kisa bir hedef, alti aydinlik bir ekran) yazi yine okunur kalsin.
    borderRadius: 999,
    backgroundColor: 'rgba(10, 10, 10, 0.55)',
  },
  atlaMetin: {
    fontFamily: theme.font.bodyMedium,
    fontSize: 13,
    color: theme.colors.cream,
  },
});
