import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type Comment,
  type CommentReportReason,
  useAddComment,
  useBlockUser,
  useComments,
  useDeleteComment,
  useReportComment,
} from '../src/api/queries';
import { trackCommentPosted } from '../src/lib/analytics';
import { ApiError } from '../src/lib/api';
import { buyukHarf } from '../src/lib/buyuk-harf';
import { readCommentsRoute } from '../src/lib/route-text';
import { useAuthStore } from '../src/stores/auth';
import { theme } from '../src/theme';

const TERMS_URL = 'https://butika.ai/kullanim-kosullari';

function statsLabel(
  u: {
    gender: 'female' | 'male' | null;
    heightCm: number | null;
    weightKg: number | null;
  },
  t: (key: string) => string,
): string | null {
  const parts: string[] = [];
  if (u.gender) parts.push(t(u.gender === 'female' ? 'comments.female' : 'comments.male'));
  if (u.heightCm != null) parts.push(`${u.heightCm} cm`);
  if (u.weightKg != null) parts.push(`${u.weightKg} kg`);
  return parts.length ? parts.join(' · ') : null;
}

export default function CommentsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ boutiqueId: string; adres?: string; baslik?: string }>();
  // The page's address exactly as the store screen shows it (src/lib/route-text.ts), so the
  // thread and the store screen's count read the same comments.
  const route = readCommentsRoute({ adres: params.adres, baslik: params.baslik });
  const decodedUrl = route.url ?? '';
  const { data, isLoading, refetch, isRefetching } = useComments(decodedUrl);
  const addMutation = useAddComment();
  const deleteMutation = useDeleteComment();
  const reportMutation = useReportComment();
  const blockMutation = useBlockUser();
  const myUserId = useAuthStore((s) => s.user?.id);
  const insets = useSafeAreaInsets();
  const [body, setBody] = useState('');
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);

  function send() {
    const trimmed = body.trim();
    if (trimmed.length === 0 || addMutation.isPending) return;
    addMutation.mutate(
      { boutiqueId: params.boutiqueId, url: decodedUrl, body: trimmed },
      {
        onSuccess: () => {
          setBody('');
          trackCommentPosted({ boutiqueId: params.boutiqueId, commentLength: trimmed.length });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: (err) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          // İçerik filtresi engellediyse genel hata yerine ne olduğunu söyle —
          // kullanıcı düzeltebilsin (App Store 1.2 filtresi).
          const engellendi = err instanceof ApiError && err.code === 'inappropriate_content';
          Alert.alert(
            t(engellendi ? 'comments.blockedContentTitle' : 'comments.sendFailedTitle'),
            t(engellendi ? 'comments.blockedContentBody' : 'comments.sendFailedBody'),
          );
        },
      },
    );
  }

  function onLongPressComment(c: Comment) {
    Haptics.selectionAsync();
    if (c.userId === myUserId) {
      // Kendi yorumun → sil
      const opts = [t('comments.cancel'), t('comments.delete')];
      const handle = (i: number) => {
        if (i === 1) deleteMutation.mutate({ id: c.id, url: decodedUrl });
      };
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: opts, cancelButtonIndex: 0, destructiveButtonIndex: 1 },
          handle,
        );
      } else {
        Alert.alert(t('comments.ownCommentTitle'), undefined, [
          { text: t('comments.delete'), style: 'destructive', onPress: () => handle(1) },
          { text: t('comments.cancel'), style: 'cancel' },
        ]);
      }
      return;
    }
    // Başkasının yorumu → şikayet et / kullanıcıyı engelle
    const opts = [t('comments.cancel'), t('comments.report'), t('comments.block')];
    const handle = (i: number) => {
      if (i === 1) setReportTarget(c);
      else if (i === 2) confirmBlock(c);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: opts, cancelButtonIndex: 0, destructiveButtonIndex: 2 },
        handle,
      );
    } else {
      Alert.alert(t('comments.moderationTitle'), undefined, [
        { text: t('comments.report'), onPress: () => handle(1) },
        { text: t('comments.block'), style: 'destructive', onPress: () => handle(2) },
        { text: t('comments.cancel'), style: 'cancel' },
      ]);
    }
  }

  function confirmBlock(c: Comment) {
    Alert.alert(t('comments.blockConfirmTitle'), t('comments.blockConfirmBody'), [
      { text: t('comments.cancel'), style: 'cancel' },
      {
        text: t('comments.block'),
        style: 'destructive',
        onPress: () =>
          blockMutation.mutate(
            { userId: c.userId, url: decodedUrl },
            {
              onSuccess: () => Alert.alert(t('comments.blockedTitle'), t('comments.blockedBody')),
            },
          ),
      },
    ]);
  }

  function submitReport(reason: CommentReportReason) {
    const c = reportTarget;
    setReportTarget(null);
    if (!c) return;
    reportMutation.mutate(
      { id: c.id, reason },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(t('comments.reportThanksTitle'), t('comments.reportThanksBody'));
        },
      },
    );
  }

  const items = data?.items ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>{buyukHarf(t('comments.kicker'), i18n.language)}</Text>
            <Text style={styles.title} numberOfLines={1}>
              {route.title ?? t('comments.productFallback')}
            </Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="close" size={18} color={theme.colors.ink} />
          </Pressable>
        </View>
        <View style={styles.divider} />

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={theme.colors.gold} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            refreshing={isRefetching}
            onRefresh={refetch}
            renderItem={({ item }) => (
              <Pressable
                onLongPress={() => onLongPressComment(item)}
                delayLongPress={300}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarLetter}>
                    {item.user.displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.bubble}>
                  <View style={styles.bubbleHead}>
                    <Text style={styles.who}>{item.user.displayName}</Text>
                    <Text style={styles.when}>
                      {formatDistanceToNow(new Date(item.createdAt), {
                        addSuffix: false,
                        locale: tr,
                      })}
                    </Text>
                    {item.userId === myUserId && (
                      <View style={styles.ownTag}>
                        <Text style={styles.ownTagLabel}>{t('comments.ownTag')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.body}>{item.body}</Text>
                  {(() => {
                    const stats = statsLabel(item.user, t);
                    return stats ? <Text style={styles.userStats}>{stats}</Text> : null;
                  })()}
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyRule} />
                <Text style={styles.emptyText}>{t('comments.empty')}</Text>
                <View style={styles.emptyRule} />
              </View>
            }
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          />
        )}

        <View style={[styles.composer, { paddingBottom: insets.bottom }]}>
          <View style={styles.composerHairline} />
          <Text style={styles.eulaNote}>
            {t('comments.eulaNote')}{' '}
            <Text style={styles.eulaLink} onPress={() => Linking.openURL(TERMS_URL)}>
              {t('comments.termsLink')}
            </Text>
          </Text>
          <PostHogMaskView style={styles.inputRow}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder={t('comments.placeholder')}
              placeholderTextColor={theme.colors.inkFaint}
              style={styles.input}
              maxLength={1000}
              multiline
              editable={!addMutation.isPending}
            />
            <Pressable
              onPress={send}
              disabled={body.trim().length === 0 || addMutation.isPending}
              hitSlop={6}
              style={({ pressed }) => [
                styles.send,
                (body.trim().length === 0 || addMutation.isPending) && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {addMutation.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.cream} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={theme.colors.cream} />
              )}
            </Pressable>
          </PostHogMaskView>
        </View>
      </KeyboardAvoidingView>

      {/* Şikayet sebebi seçici (App Store 1.2) */}
      <Modal
        visible={reportTarget != null}
        transparent
        animationType="fade"
        onRequestClose={() => setReportTarget(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setReportTarget(null)}>
          <Pressable style={styles.reasonSheet}>
            <Text style={styles.reasonTitle}>{t('comments.reportTitle')}</Text>
            {(
              [
                ['spam', 'comments.reasonSpam'],
                ['harassment', 'comments.reasonHarassment'],
                ['inappropriate', 'comments.reasonInappropriate'],
                ['other', 'comments.reasonOther'],
              ] as const
            ).map(([reason, key]) => (
              <Pressable
                key={reason}
                style={({ pressed }) => [styles.reasonRow, pressed && { opacity: 0.6 }]}
                onPress={() => submitReport(reason)}
              >
                <Text style={styles.reasonLabel}>{t(key)}</Text>
              </Pressable>
            ))}
            <Pressable style={styles.reasonCancel} onPress={() => setReportTarget(null)}>
              <Text style={styles.reasonCancelLabel}>{t('comments.cancel')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  headerText: { flex: 1, gap: 2 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 3,
  },
  title: {
    fontFamily: 'Newsreader_500Medium',
    fontSize: 18,
    color: theme.colors.ink,
    letterSpacing: 0.1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.mist,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginHorizontal: 20,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: 'Newsreader_500Medium',
    fontSize: 16,
    color: theme.colors.ink,
  },
  bubble: {
    flex: 1,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  bubbleHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  who: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: theme.colors.ink,
  },
  when: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1,
  },
  ownTag: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: theme.colors.mist,
  },
  ownTagLabel: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 1,
    textTransform: 'lowercase',
  },
  body: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.ink,
  },
  userStats: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: theme.colors.inkFaint,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
    paddingTop: 80,
  },
  emptyRule: {
    width: 48,
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.gold,
  },
  emptyText: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 22,
    lineHeight: 30,
    color: theme.colors.inkMute,
    textAlign: 'center',
  },
  composer: {
    backgroundColor: theme.colors.cream,
  },
  composerHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: theme.colors.ink,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eulaNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.inkFaint,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  eulaLink: {
    color: theme.colors.gold,
    textDecorationLine: 'underline',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.4)',
    justifyContent: 'flex-end',
  },
  reasonSheet: {
    backgroundColor: theme.colors.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    gap: 4,
  },
  reasonTitle: {
    fontFamily: 'Newsreader_500Medium',
    fontSize: 18,
    color: theme.colors.ink,
    marginBottom: 10,
  },
  reasonRow: {
    height: 52,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.mist,
  },
  reasonLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: theme.colors.ink,
  },
  reasonCancel: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  reasonCancelLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 16,
    color: theme.colors.inkMute,
  },
});
