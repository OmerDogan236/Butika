import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUpdateProfile } from '../../src/api/queries';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { useAuthStore } from '../../src/stores/auth';
import { theme } from '../../src/theme';

type Gender = 'female' | 'male';

export default function EditProfileScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useUpdateProfile();

  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [height, setHeight] = useState(user?.heightCm != null ? String(user.heightCm) : '');
  const [weight, setWeight] = useState(user?.weightKg != null ? String(user.weightKg) : '');
  const [showStats, setShowStats] = useState(user?.showStatsInComments ?? false);
  const [error, setError] = useState<string | null>(null);

  function toggleGender(value: Gender) {
    setGender((prev) => (prev === value ? null : value));
  }

  function handleHeightChange(text: string) {
    // Allow only digits
    setHeight(text.replace(/[^0-9]/g, ''));
  }

  function handleWeightChange(text: string) {
    setWeight(text.replace(/[^0-9]/g, ''));
  }

  async function handleSave() {
    const trimmedName = displayName.trim();
    if (trimmedName.length === 0) {
      setError(t('profile.nameRequired'));
      return;
    }
    setError(null);

    // Parse height — null when emptied (clear previously set value)
    let heightCm: number | null = null;
    if (height.trim().length > 0) {
      const h = Number.parseInt(height, 10);
      if (!Number.isNaN(h) && h >= 100 && h <= 250) {
        heightCm = h;
      }
    }

    // Parse weight — null when emptied
    let weightKg: number | null = null;
    if (weight.trim().length > 0) {
      const w = Number.parseInt(weight, 10);
      if (!Number.isNaN(w) && w >= 30 && w <= 300) {
        weightKg = w;
      }
    }

    try {
      await updateProfile.mutateAsync({
        displayName: trimmedName,
        gender: gender, // null → clear
        heightCm: heightCm, // null → clear
        weightKg: weightKg, // null → clear
        showStatsInComments: showStats,
      });
      router.back();
    } catch {
      setError(t('profile.saveFailed'));
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={24} color={theme.colors.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.kicker}>{buyukHarf(t('profile.editKicker'), i18n.language)}</Text>
          <Text style={styles.title}>{t('profile.editTitle')}</Text>

          <View style={styles.rule} />

          {/* Görünen ad */}
          <PostHogMaskView style={styles.field}>
            <Text style={styles.label}>{buyukHarf(t('profile.displayName'), i18n.language)}</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              maxLength={40}
              autoCapitalize="words"
            />
          </PostHogMaskView>

          {/* Cinsiyet */}
          <PostHogMaskView style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.label}>{buyukHarf(t('profile.gender'), i18n.language)}</Text>
              <Text style={styles.hint}>{t('profile.optional')}</Text>
            </View>
            <View style={styles.genderRow}>
              <Pressable
                onPress={() => toggleGender('female')}
                style={({ pressed }) => [
                  styles.genderCard,
                  gender === 'female' && styles.genderCardActive,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[styles.genderLabel, gender === 'female' && styles.genderLabelActive]}>
                  {t('profile.genderFemale')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleGender('male')}
                style={({ pressed }) => [
                  styles.genderCard,
                  gender === 'male' && styles.genderCardActive,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={[styles.genderLabel, gender === 'male' && styles.genderLabelActive]}>
                  {t('profile.genderMale')}
                </Text>
              </Pressable>
            </View>
          </PostHogMaskView>

          {/* Boy */}
          <PostHogMaskView style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.label}>{buyukHarf(t('profile.height'), i18n.language)}</Text>
              <Text style={styles.hint}>{t('profile.optional')}</Text>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                value={height}
                onChangeText={handleHeightChange}
                placeholder="170"
                placeholderTextColor={theme.colors.inkFaint}
                style={styles.inputFlex}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.unit}>{t('profile.heightUnit')}</Text>
            </View>
          </PostHogMaskView>

          {/* Kilo */}
          <PostHogMaskView style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.label}>{buyukHarf(t('profile.weight'), i18n.language)}</Text>
              <Text style={styles.hint}>{t('profile.optional')}</Text>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                value={weight}
                onChangeText={handleWeightChange}
                placeholder="60"
                placeholderTextColor={theme.colors.inkFaint}
                style={styles.inputFlex}
                keyboardType="number-pad"
                maxLength={3}
              />
              <Text style={styles.unit}>{t('profile.weightUnit')}</Text>
            </View>
          </PostHogMaskView>

          {/* Yorumlarda göster toggle */}
          <View style={styles.toggleField}>
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel}>{t('profile.showStatsLabel')}</Text>
              <Text style={styles.toggleDesc}>{t('profile.showStatsDesc')}</Text>
            </View>
            <Switch
              value={showStats}
              onValueChange={setShowStats}
              trackColor={{ false: theme.colors.mist, true: theme.colors.gold }}
              thumbColor={theme.colors.cream}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSave}
            disabled={updateProfile.isPending}
            style={({ pressed }) => [
              styles.submit,
              (pressed || updateProfile.isPending) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>
              {buyukHarf(
                updateProfile.isPending ? t('profile.saving') : t('profile.save'),
                i18n.language,
              )}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, alignItems: 'flex-end' },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 36,
    lineHeight: 42,
    color: theme.colors.ink,
    marginTop: 8,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginVertical: 32,
  },
  field: { marginBottom: 28 },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    ...theme.type.micro,
    color: theme.colors.ink,
    letterSpacing: 2,
  },
  hint: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mist,
    paddingVertical: 10,
    marginTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mist,
  },
  inputFlex: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
    paddingVertical: 10,
  },
  unit: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
    paddingLeft: 8,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderCard: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: theme.colors.mist,
    backgroundColor: theme.colors.creamSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  genderCardActive: {
    borderColor: theme.colors.gold,
    borderWidth: 1.5,
    backgroundColor: '#F5EDE1',
  },
  genderLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.inkMute,
    letterSpacing: 0.5,
  },
  genderLabelActive: {
    color: theme.colors.ink,
  },
  toggleField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.mist,
    marginBottom: 28,
  },
  toggleText: { flex: 1 },
  toggleLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: theme.colors.ink,
    letterSpacing: 0.1,
    marginBottom: 4,
  },
  toggleDesc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: theme.colors.inkMute,
    lineHeight: 18,
  },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.clay,
    marginBottom: 12,
  },
  submit: {
    marginTop: 8,
    backgroundColor: theme.colors.bordo,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 3,
    color: theme.colors.cream,
  },
});
