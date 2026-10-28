import { Ionicons } from '@expo/vector-icons';
import { PostHogMaskView } from 'posthog-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { buyukHarf } from '../lib/buyuk-harf';
import { findCarrier, suggestCarriers } from '../lib/carriers';
import { theme } from '../theme';

// Kargo firması girişi: yazınca öneriler süzülür (pazara göre), listede yoksa
// yazdığı metin "olarak kullan" ile serbest girilir.
export function CarrierCombobox({
  value,
  onChange,
  market,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  market: string | null;
  placeholder: string;
}) {
  const { t, i18n } = useTranslation();
  const [focused, setFocused] = useState(false);
  const suggestions = suggestCarriers(value, market);
  const trimmed = value.trim();
  const exact = trimmed.length > 0 && !!findCarrier(trimmed);
  const showFree = focused && trimmed.length > 0 && !exact;
  const showList = focused && (suggestions.length > 0 || showFree);

  function pick(name: string) {
    onChange(name);
    setFocused(false);
    Keyboard.dismiss();
  }

  return (
    <View>
      <PostHogMaskView style={[s.input, focused && s.inputFocus]}>
        <Ionicons name="cube-outline" size={18} color={theme.colors.inkMute} />
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.inkFaint}
          style={s.field}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {value.length > 0 ? (
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={theme.colors.inkFaint} />
          </Pressable>
        ) : null}
      </PostHogMaskView>

      {showList ? (
        <View style={s.list}>
          {showFree ? (
            <Pressable style={s.free} onPress={() => pick(trimmed)}>
              <Ionicons name="add" size={16} color={theme.colors.gold} />
              <Text style={s.freeText}>{t('purchases.carrierUse', { q: trimmed })}</Text>
            </Pressable>
          ) : null}
          {suggestions.length > 0 ? (
            <Text style={s.lbl}>{buyukHarf(t('purchases.suggestions'), i18n.language)}</Text>
          ) : null}
          {suggestions.map((c) => (
            <Pressable key={c.name} style={s.item} onPress={() => pick(c.name)}>
              <View style={s.dot} />
              <Text style={s.itemText}>{c.name}</Text>
              {c.trackUrl ? (
                <Ionicons
                  name="navigate-outline"
                  size={13}
                  color={theme.colors.inkFaint}
                  style={{ marginLeft: 'auto' }}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  inputFocus: {
    borderColor: theme.colors.gold,
    backgroundColor: theme.colors.cream,
  },
  field: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.colors.ink,
    paddingVertical: 0,
  },
  list: {
    marginTop: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    borderRadius: 11,
    backgroundColor: theme.colors.cream,
    overflow: 'hidden',
  },
  lbl: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1.5,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.gold },
  itemText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.colors.ink },
  free: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
  },
  freeText: { fontFamily: 'Inter_500Medium', fontSize: 13.5, color: theme.colors.gold },
});
