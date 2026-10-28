import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { type ReactNode, useState } from 'react';
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
import { useSuggestBoutique } from '../src/api/queries';
import { Toast, type ToastTone } from '../src/components/Toast';
import { ApiError } from '../src/lib/api';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { theme } from '../src/theme';

export default function SuggestScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ name?: string }>();
  const [name, setName] = useState(params.name ?? '');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState<{ visible: boolean; message: string; tone: ToastTone }>({
    visible: false,
    message: '',
    tone: 'success',
  });
  const suggest = useSuggestBoutique();

  function showToast(message: string, tone: ToastTone = 'success') {
    setToast({ visible: true, message, tone });
  }

  async function handleSubmit() {
    const trimmed = { name: name.trim(), url: url.trim(), note: note.trim() };
    if (trimmed.name.length < 2) {
      showToast(t('suggest.nameTooShort'), 'error');
      return;
    }
    try {
      new URL(trimmed.url);
    } catch {
      showToast(t('suggest.invalidUrl'), 'error');
      return;
    }

    try {
      await suggest.mutateAsync({
        name: trimmed.name,
        url: trimmed.url,
        note: trimmed.note || undefined,
      });
      // Teşekkür uyarısı okunmadan ekran kapanmasın: kullanıcı kapatınca geri döner.
      showToast(t('suggest.success'), 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'boutique_exists') {
          showToast(t('suggest.alreadyExists'), 'info');
        } else if (err.code === 'suggestion_pending') {
          showToast(t('suggest.alreadyPending'), 'info');
        } else {
          showToast(err.message || t('suggest.genericError'), 'error');
        }
      } else {
        showToast(t('suggest.genericError'), 'error');
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.kicker}>{buyukHarf(t('suggest.kicker'), i18n.language)}</Text>
          <Text style={styles.title}>
            {t('suggest.titleLine1')}
            <Text style={styles.titleItalic}>{t('suggest.titleLine2')}</Text>
          </Text>
          <Text style={styles.desc}>{t('suggest.desc')}</Text>

          <View style={styles.rule} />

          <Field label={t('suggest.nameLabel')}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('suggest.namePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              maxLength={80}
              autoCapitalize="words"
            />
          </Field>

          <Field label={t('suggest.urlLabel')} hint={t('suggest.urlHint')}>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://"
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={2048}
            />
          </Field>

          <Field label={t('suggest.noteLabel')} hint={t('suggest.noteHint')}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('suggest.notePlaceholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={[styles.input, styles.textarea]}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </Field>

          <Pressable
            onPress={handleSubmit}
            disabled={suggest.isPending}
            style={({ pressed }) => [
              styles.submit,
              (pressed || suggest.isPending) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.submitText}>
              {buyukHarf(
                suggest.isPending ? t('suggest.submitting') : t('suggest.submit'),
                i18n.language,
              )}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        tone={toast.tone}
        onClose={() => {
          setToast((t) => ({ ...t, visible: false }));
          if (toast.tone === 'success') router.back();
        }}
      />
    </SafeAreaView>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const { i18n } = useTranslation();
  return (
    <PostHogMaskView style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{buyukHarf(label, i18n.language)}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </PostHogMaskView>
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
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
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
  titleItalic: {
    color: theme.colors.gold,
  },
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
  field: {
    marginBottom: 24,
  },
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
  },
  hint: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
    textTransform: 'none',
  },
  input: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mist,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 96,
    paddingTop: 12,
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
