import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
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
import { useCollection, useUpdateCollection } from '../../../src/api/queries';
import { ApiError } from '../../../src/lib/api';
import { buyukHarf } from '../../../src/lib/buyuk-harf';
import { theme } from '../../../src/theme';

export default function EditCollectionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id ?? '';

  const { data, isLoading } = useCollection(id);
  const update = useUpdateCollection();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setDescription(data.description ?? '');
    }
  }, [data]);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t('collections.errNameTooShort'));
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        id,
        name: trimmed,
        description: description.trim() || undefined,
      });
      router.back();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') {
        setError(t('collections.errNameTaken'));
      } else {
        setError(t('collections.errUpdateFailed'));
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

        {isLoading ? (
          <ActivityIndicator color={theme.colors.gold} style={styles.loading} />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.kicker}>
              {buyukHarf(t('collections.editKicker'), i18n.language)}
            </Text>
            <Text style={styles.title}>{data?.name}</Text>

            <View style={styles.rule} />

            <PostHogMaskView style={styles.field}>
              <Text style={styles.label}>
                {buyukHarf(t('collections.nameLabel'), i18n.language)}
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholderTextColor={theme.colors.inkFaint}
                style={styles.input}
                maxLength={60}
                autoCapitalize="words"
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
              disabled={update.isPending}
              style={({ pressed }) => [
                styles.submit,
                (pressed || update.isPending) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.submitText}>
                {buyukHarf(
                  update.isPending ? t('collections.saving') : t('collections.save'),
                  i18n.language,
                )}
              </Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, alignItems: 'flex-end' },
  scroll: { paddingHorizontal: 24, paddingBottom: 48 },
  loading: { paddingVertical: 80 },
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
