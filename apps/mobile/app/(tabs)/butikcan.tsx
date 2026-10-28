import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { PostHogMaskView } from 'posthog-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type ButikcanBoutique, type ButikcanTurn, useButikcanChat } from '../../src/api/queries';
import { BoutiqueCard } from '../../src/components/BoutiqueCard';
import { TurHedefi } from '../../src/components/tur/TurHedefi';
import { grantAiConsent, hasAiConsent } from '../../src/lib/ai-consent';
import { trackButikcanReplied, trackButikcanUsed } from '../../src/lib/analytics';
import { ApiError } from '../../src/lib/api';
import { butikYolu } from '../../src/lib/butik-kaynagi';
import { buyukHarf } from '../../src/lib/buyuk-harf';
import { useAuthStore } from '../../src/stores/auth';
import { useTurStore } from '../../src/stores/tur';
import { theme } from '../../src/theme';

const MASCOT = require('../../assets/butikcan.png');
const SCREEN_PADDING = 20;
const PRIVACY_URL = 'https://butika.ai/aydinlatma-metni';

interface ChatMsg {
  id: string;
  role: 'user' | 'butikcan';
  text: string;
  boutiques?: ButikcanBoutique[];
  seed?: boolean;
}

// Metni "yazıyormuş" gibi gösterir (sadece enabled iken).
function useTypewriter(text: string, enabled: boolean, speed = 20): string {
  const [shown, setShown] = useState(enabled ? '' : text);
  useEffect(() => {
    if (!enabled) {
      setShown(text);
      return;
    }
    setShown('');
    if (!text) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, enabled, speed]);
  return shown;
}

export default function ButikcanScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  // null = henüz okunmadı. Onay yoksa ilk mesajda bilgilendirme penceresi açılır.
  const [aiConsent, setAiConsent] = useState<boolean | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMsg>>(null);
  const idSeq = useRef(0);
  const chatMutation = useButikcanChat();

  const [messages, setMessages] = useState<ChatMsg[]>(() => [
    { id: 'seed', role: 'butikcan', seed: true, text: t('butikcan.greeting') },
  ]);
  const [input, setInput] = useState('');
  // Vitrin aramasında sonuç çıkmayınca "Butikcan'a sor": yazılan kelime kutuya gelir.
  const { soru } = useLocalSearchParams<{ soru?: string }>();
  useEffect(() => {
    if (!soru) return;
    setInput(soru);
    router.setParams({ soru: undefined });
  }, [soru, router]);

  const uid = () => {
    idSeq.current += 1;
    return `m${idSeq.current}`;
  };

  useEffect(() => {
    if (!userId) return;
    let active = true;
    hasAiConsent(userId).then((granted) => {
      if (active) setAiConsent(granted);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, []);

  const turuBaslat = useTurStore((s) => s.turuBaslat);
  const turGorulenler = useTurStore((s) => s.gorulenler);
  // Tur YALNIZ ekran odaktayken baslar (bkz. index.tsx'teki ayni aciklama).
  useFocusEffect(
    useCallback(() => {
      if (turGorulenler === null) return;
      const zamanlayici = setTimeout(() => turuBaslat('butikcan'), 400);
      return () => clearTimeout(zamanlayici);
    }, [turGorulenler, turuBaslat]),
  );

  function send() {
    const text = input.trim();
    if (text.length === 0 || chatMutation.isPending) return;
    // Onay verilmeden hiçbir mesaj yapay zekâ sağlayıcısına gitmez (Apple 5.1.2(i)).
    if (aiConsent !== true) {
      // null = cihazdaki kayıt henüz okunuyor (milisaniyeler); onayı olan kullanıcıya pencere açma.
      if (aiConsent === false) setConsentOpen(true);
      return;
    }
    deliver(text);
  }

  async function acceptAiConsent() {
    if (!userId) return;
    setConsentOpen(false);
    await grantAiConsent(userId, i18n.language === 'en' ? 'en' : 'tr');
    setAiConsent(true);
    const text = input.trim();
    if (text.length > 0) deliver(text);
  }

  function deliver(text: string) {
    const userMsg: ChatMsg = { id: uid(), role: 'user', text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');

    const history: ButikcanTurn[] = next
      .filter((m) => !m.seed)
      .map((m) => ({ role: m.role === 'butikcan' ? 'model' : 'user', text: m.text }));

    trackButikcanUsed({ queryLength: text.length, turnCount: history.length });
    const baslangic = Date.now();
    chatMutation.mutate(history, {
      onSuccess: (res) => {
        trackButikcanReplied({
          turnCount: history.length,
          ok: true,
          boutiqueCount: res.boutiques.length,
          replyLength: res.reply.length,
          latencyMs: Date.now() - baslangic,
        });
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'butikcan', text: res.reply, boutiques: res.boutiques },
        ]);
      },
      onError: (error) => {
        trackButikcanReplied({
          turnCount: history.length,
          ok: false,
          boutiqueCount: 0,
          replyLength: 0,
          latencyMs: Date.now() - baslangic,
          errorStatus: error instanceof ApiError ? error.status : null,
        });
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'butikcan', text: t('butikcan.errorReply') },
        ]);
      },
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Image source={MASCOT} style={styles.headerMascot} contentFit="contain" />
        <View>
          <Text style={styles.kicker}>{buyukHarf(t('butikcan.kicker'), i18n.language)}</Text>
          <View style={styles.brandHap}>
            <Text style={styles.brand}>Butikcan</Text>
          </View>
        </View>
      </View>
      <View style={styles.divider} />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          style={styles.flex}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item, index }) => (
            <MessageRow
              msg={item}
              animate={index === messages.length - 1 && item.role === 'butikcan'}
              onOpen={(id, sira) => router.push(butikYolu(id, 'butikcan', undefined, sira))}
            />
          )}
          ListFooterComponent={chatMutation.isPending ? <TypingBubble /> : null}
        />

        <View style={[styles.composer, { paddingBottom: 10 }]}>
          <TurHedefi hedefId="butikcan.girdi">
            <PostHogMaskView style={styles.inputWrap}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={t('butikcan.inputPlaceholder')}
                placeholderTextColor={theme.colors.inkFaint}
                style={styles.input}
                multiline
                maxLength={500}
                onSubmitEditing={send}
                editable={!chatMutation.isPending}
              />
              <Pressable
                onPress={send}
                disabled={input.trim().length === 0 || chatMutation.isPending}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.send,
                  (input.trim().length === 0 || chatMutation.isPending) && { opacity: 0.4 },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Ionicons name="arrow-up" size={18} color={theme.colors.cream} />
              </Pressable>
            </PostHogMaskView>
          </TurHedefi>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={consentOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConsentOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setConsentOpen(false)}>
          <Pressable style={styles.consentSheet}>
            <Image source={MASCOT} style={styles.consentMascot} contentFit="contain" />
            <Text style={styles.consentTitle}>{t('butikcan.aiConsentTitle')}</Text>
            <Text style={styles.consentBody}>
              {t('butikcan.aiConsentBody')}{' '}
              <Text style={styles.consentLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                {t('butikcan.aiConsentLink')}
              </Text>
            </Text>
            <Pressable
              style={({ pressed }) => [styles.consentAccept, pressed && { opacity: 0.85 }]}
              onPress={acceptAiConsent}
            >
              <Text style={styles.consentAcceptLabel}>{t('butikcan.aiConsentAccept')}</Text>
            </Pressable>
            <Pressable style={styles.consentDecline} onPress={() => setConsentOpen(false)}>
              <Text style={styles.consentDeclineLabel}>{t('butikcan.aiConsentDecline')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function MessageRow({
  msg,
  animate,
  onOpen,
}: {
  msg: ChatMsg;
  animate: boolean;
  /** sira: kartın bu cevaptaki 1-tabanlı yeri. */
  onOpen: (id: string, sira: number) => void;
}) {
  const typed = useTypewriter(msg.text, animate && msg.role === 'butikcan');

  if (msg.role === 'user') {
    return (
      <View style={styles.userRow}>
        <PostHogMaskView style={styles.userBubble}>
          <Text style={styles.userText}>{msg.text}</Text>
        </PostHogMaskView>
      </View>
    );
  }

  return (
    <View style={styles.botRow}>
      <Image source={MASCOT} style={styles.avatar} contentFit="contain" />
      <View style={styles.botCol}>
        <View style={styles.botBubble}>
          <Text style={styles.botText}>{animate ? typed : msg.text}</Text>
        </View>
        {msg.boutiques && msg.boutiques.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cards}
          >
            {msg.boutiques.map((b, i) => (
              <View key={b.id} style={styles.card}>
                <BoutiqueCard boutique={b} onPress={() => onOpen(b.id, i + 1)} />
                {b.reason ? <Text style={styles.reason}>“{b.reason}”</Text> : null}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

function TypingBubble() {
  const d = useSharedValue(0);
  useEffect(() => {
    d.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, [d]);
  const s1 = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * Math.abs(Math.sin(d.value * Math.PI)),
  }));
  const s2 = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * Math.abs(Math.sin((d.value + 0.33) * Math.PI)),
  }));
  const s3 = useAnimatedStyle(() => ({
    opacity: 0.3 + 0.7 * Math.abs(Math.sin((d.value + 0.66) * Math.PI)),
  }));
  return (
    <View style={styles.botRow}>
      <Image source={MASCOT} style={styles.avatar} contentFit="contain" />
      <View style={[styles.botBubble, styles.typing]}>
        <Animated.View style={[styles.dot, s1]} />
        <Animated.View style={[styles.dot, s2]} />
        <Animated.View style={[styles.dot, s3]} />
      </View>
    </View>
  );
}

const CARD_W = 150;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerMascot: { width: 44, height: 44 },
  kicker: {
    ...theme.type.micro,
    color: theme.colors.inkMute,
    letterSpacing: 3,
  },
  // Başlık yuvarlak bordo hapın içinde (Keşfet'teki seçili kategori gibi).
  brandHap: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.bordoAcik,
  },
  brand: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 24,
    lineHeight: 30,
    color: theme.colors.cream,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginHorizontal: SCREEN_PADDING,
  },
  list: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 16,
  },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: theme.colors.bordo,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.cream,
  },
  botRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  avatar: { width: 30, height: 30, marginBottom: 2 },
  botCol: { flex: 1, gap: 10 },
  botBubble: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    backgroundColor: theme.colors.creamSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  botText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.ink,
  },
  typing: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 14,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.inkFaint,
  },
  cards: {
    flexDirection: 'row',
    gap: 14,
    paddingTop: 2,
    paddingRight: 8,
  },
  card: { width: CARD_W },
  reason: {
    marginTop: 6,
    fontFamily: 'Newsreader_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.gold,
  },
  composer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.mist,
    backgroundColor: theme.colors.cream,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.creamSoft,
    borderRadius: 23,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.mist,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: theme.colors.ink,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.bordo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.4)',
    justifyContent: 'flex-end',
  },
  consentSheet: {
    backgroundColor: theme.colors.cream,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    gap: 14,
  },
  consentMascot: { width: 48, height: 48 },
  consentTitle: { ...theme.type.h2, color: theme.colors.ink },
  consentBody: { ...theme.type.body, color: theme.colors.inkMute },
  consentLink: { color: theme.colors.gold, textDecorationLine: 'underline' },
  consentAccept: {
    marginTop: 6,
    backgroundColor: theme.colors.bordo,
    borderRadius: 6,
    paddingVertical: 15,
    alignItems: 'center',
  },
  consentAcceptLabel: {
    fontFamily: theme.font.bodySemibold,
    fontSize: 14,
    letterSpacing: 1.2,
    color: theme.colors.cream,
  },
  consentDecline: { paddingVertical: 10, alignItems: 'center' },
  consentDeclineLabel: {
    fontFamily: theme.font.bodyMedium,
    fontSize: 14,
    color: theme.colors.inkMute,
  },
});
