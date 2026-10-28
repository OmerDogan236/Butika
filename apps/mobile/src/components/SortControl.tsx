import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Siralama } from '../api/queries';
import { captureEvent } from '../lib/analytics';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

const SIDE_PADDING = 24;

interface SortControlProps {
  value: Siralama;
  onChange: (value: Siralama) => void;
  kisiselVar: boolean;
  /** Menüdeki tarz satırı: test varsa "güncelle", yoksa "anlat" ("Sana özel" profilden de gelebilir). */
  testVar: boolean;
  onTarziGuncelle: () => void;
}

/**
 * Sıralama seçenekleri ve `Siralama` tipi değişmedi; yalnız tetikleyici
 * başlığın sağ üstüne taşındı (44px hap) ve açılır panel sağ üste hizalandı.
 */
export function SortControl({
  value,
  onChange,
  kisiselVar,
  testVar,
  onTarziGuncelle,
}: SortControlProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);

  const secenekler: { deger: Siralama; etiket: string }[] = [
    kisiselVar
      ? { deger: 'kisisel', etiket: t('showcase.sortForYou') }
      : { deger: 'onerilen', etiket: t('showcase.sortRecommended') },
    { deger: 'uygun_once', etiket: t('showcase.sortCheapFirst') },
    { deger: 'luks_once', etiket: t('showcase.sortLuxeFirst') },
    { deger: 'alfabetik', etiket: t('showcase.sortAZ') },
  ];
  const aktif = secenekler.find((s) => s.deger === value) ?? secenekler[0];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${t('showcase.sortLabel')}: ${aktif?.etiket ?? ''}`}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.label}>{buyukHarf(t('showcase.sortLabel'), i18n.language)}</Text>
        <Text style={styles.value} numberOfLines={1}>
          {aktif?.etiket}
        </Text>
        <Ionicons name="chevron-down" size={12} color={theme.colors.ink} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.panel}>
            {secenekler.map((s) => (
              <Pressable
                key={s.deger}
                onPress={() => {
                  captureEvent('siralama_secildi', { deger: s.deger });
                  onChange(s.deger);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.optionText, s.deger === value && styles.optionActive]}>
                  {s.etiket}
                </Text>
                {s.deger === value ? (
                  <Ionicons name="checkmark" size={16} color={theme.colors.gold} />
                ) : null}
              </Pressable>
            ))}
            <View style={styles.ayirac} />
            <Pressable
              onPress={() => {
                setOpen(false);
                onTarziGuncelle();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.optionText}>
                {t(testVar ? 'showcase.updateStyle' : 'showcase.tellStyle')}
              </Text>
              <Ionicons name="sparkles" size={14} color={theme.colors.bordo} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 22,
    // Arama kutusuyla aynı açık bordo zemin.
    backgroundColor: theme.colors.bordoZemin,
  },
  label: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 1.6,
  },
  value: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 0.4,
    color: theme.colors.ink,
    maxWidth: 92,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.35)',
    alignItems: 'flex-end',
    // Tetikleyici Butikcan seridinin altinda; panel de onun hemen altinda acilir.
    paddingTop: 232,
    paddingRight: SIDE_PADDING,
  },
  panel: {
    width: 196,
    backgroundColor: theme.colors.cream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    paddingVertical: 6,
    shadowColor: '#0A0A0A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  optionText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.colors.ink,
  },
  ayirac: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 16,
    backgroundColor: theme.colors.mist,
  },
  optionActive: {
    fontFamily: 'Inter_500Medium',
    color: theme.colors.gold,
  },
});
