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
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCreateCollection } from '../../src/api/queries';
import { ApiError } from '../../src/lib/api';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { theme } from '../../src/theme';

export default function NewCollectionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCollection();

  async function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t('collections.errNameTooShort'));
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        name: trimmed,
        description: description.trim() || undefined,
      });
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') {
        setError(t('collections.errNameTaken'));
      } else {
        setError(t('collections.errCreateFailed'));
      }
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
          <Text style={styles.kicker}>{buyukHarf(t('collections.newKicker'), i18n.language)}</Text>
          <Text style={styles.title}>
            {t('collections.newTitleLine1')}
            <Text style={styles.titleItalic}>{t('collections.newTitleItalic')}</Text>
            {t('collections.newTitleLine2')}
          </Text>
          <Text style={styles.desc}>{t('collections.newDesc')}</Text>

          <View style={styles.rule} />

          <PostHogMaskView style={styles.field}>
            <Text style={styles.label}>{buyukHarf(t('collections.nameLabel'), i18n.language)}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('collections.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              maxLength={60}
              autoCapitalize="words"
              autoFocus
            />
          </PostHogMaskView>

          <PostHogMaskView style={styles.field}>
            <View style={styles.fieldHead}>
              <Text style={styles.label}>
                {buyukHarf(t('collections.descLabel'), i18n.language)}
              </Text>
              <Text style={styles.hint}>{t('collections.descOptional')}</Text>
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder={t('collections.descPlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={[styles.input, styles.textarea]}
              maxLength={200}
              multiline
              textAlignVertical="top"
            />
          </PostHogMaskView>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSubmit}
            disabled={create.isPending}
            style={({ pressed }) => [
              styles.submit,
              (pressed || create.isPending) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>
              {buyukHarf(
                create.isPending ? t('collections.creating') : t('collections.create'),
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'flex-end',
  },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  title: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 40,
    lineHeight: 46,
    color: theme.colors.ink,
    marginTop: 8,
    letterSpacing: -0.3,
  },
  titleItalic: { color: theme.colors.gold },
  desc: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.inkMute,
    marginTop: 16,
    maxWidth: 320,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginVertical: 32,
  },
  field: { marginBottom: 24 },
  fieldHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    ...theme.type.micro,
    color: theme.colors.ink,
    letterSpacing: 2,
    marginBottom: 8,
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
  },
  textarea: { minHeight: 80, paddingTop: 12 },
  error: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: theme.colors.clay,
    marginBottom: 12,
  },
  submit: {
    marginTop: 16,
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
