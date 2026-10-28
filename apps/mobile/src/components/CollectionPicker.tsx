import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { PostHogMaskView } from 'posthog-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type Collection,
  useAddToCollections,
  useCollections,
  useCreateCollection,
} from '../api/queries';
import { trackCollectionAdd } from '../lib/analytics';
import { ApiError } from '../lib/api';
import { buyukHarf } from '../lib/buyuk-harf';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  savedId: string | null;
  onClose: () => void;
  onSuccess?: (count: number) => void;
}

export function CollectionPicker({ visible, savedId, onClose, onSuccess }: Props) {
  const { t, i18n } = useTranslation();
  const { data: collections, isLoading } = useCollections();
  const create = useCreateCollection();
  const addToCollections = useAddToCollections();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSelected(new Set());
    setCreating(false);
    setNewName('');
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleCreate() {
    const name = newName.trim();
    if (name.length < 2) {
      setError(t('components.pickerNameTooShort'));
      return;
    }
    setError(null);
    try {
      const created = await create.mutateAsync({ name });
      // Yeni yaratılan otomatik seçili
      setSelected((prev) => new Set(prev).add(created.id));
      setCreating(false);
      setNewName('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'name_taken') {
        setError(t('components.pickerNameTaken'));
      } else {
        setError(t('components.pickerCreateFailed'));
      }
    }
  }

  async function handleSave() {
    if (!savedId || selected.size === 0) {
      handleClose();
      return;
    }
    try {
      await addToCollections.mutateAsync({
        savedId,
        collectionIds: Array.from(selected),
      });
      trackCollectionAdd({ collectionCount: selected.size });
      onSuccess?.(selected.size);
      handleClose();
    } catch {
      setError(t('components.pickerAddFailed'));
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.root} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text style={styles.cancel}>
                {buyukHarf(t('components.pickerCancel'), i18n.language)}
              </Text>
            </Pressable>
            <Text style={styles.headerTitle}>{t('components.pickerTitle')}</Text>
            <Pressable
              onPress={handleSave}
              disabled={selected.size === 0 || addToCollections.isPending}
              hitSlop={12}
            >
              <Text
                style={[
                  styles.save,
                  (selected.size === 0 || addToCollections.isPending) && styles.saveDisabled,
                ]}
              >
                {buyukHarf(
                  addToCollections.isPending ? '…' : t('components.pickerSave'),
                  i18n.language,
                )}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {creating ? (
              <PostHogMaskView style={styles.createWrap}>
                <Text style={styles.createLabel}>
                  {buyukHarf(t('components.pickerNewLabel'), i18n.language)}
                </Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder={t('components.pickerNewPlaceholder')}
                  placeholderTextColor={theme.colors.inkFaint}
                  style={styles.createInput}
                  maxLength={60}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <View style={styles.createActions}>
                  <Pressable
                    onPress={() => {
                      setCreating(false);
                      setNewName('');
                      setError(null);
                    }}
                    style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.createBtnText}>
                      {buyukHarf(t('components.pickerCancelCreate'), i18n.language)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreate}
                    disabled={create.isPending}
                    style={({ pressed }) => [
                      styles.createBtn,
                      styles.createBtnPrimary,
                      (pressed || create.isPending) && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[styles.createBtnText, styles.createBtnTextPrimary]}>
                      {buyukHarf(
                        create.isPending
                          ? t('components.pickerCreating')
                          : t('components.pickerCreate'),
                        i18n.language,
                      )}
                    </Text>
                  </Pressable>
                </View>
              </PostHogMaskView>
            ) : (
              <Pressable
                onPress={() => setCreating(true)}
                style={({ pressed }) => [styles.newRow, pressed && { opacity: 0.7 }]}
              >
                <View style={styles.newIcon}>
                  <Ionicons name="add" size={20} color={theme.colors.gold} />
                </View>
                <Text style={styles.newText}>{t('components.pickerNewCollection')}</Text>
              </Pressable>
            )}

            <View style={styles.divider} />

            {isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="small" color={theme.colors.gold} />
              </View>
            ) : !collections || collections.length === 0 ? (
              <Text style={styles.empty}>{t('components.pickerEmpty')}</Text>
            ) : (
              collections.map((c) => (
                <CollectionRow
                  key={c.id}
                  collection={c}
                  selected={selected.has(c.id)}
                  onToggle={() => toggle(c.id)}
                />
              ))
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function CollectionRow({
  collection,
  selected,
  onToggle,
}: {
  collection: Collection;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={styles.thumb}>
        {collection.coverUrls[0] ? (
          // eslint-disable-next-line react-native/no-inline-styles
          <View style={[StyleSheet.absoluteFill, styles.thumbImageHolder]}>
            <CoverMosaic urls={collection.coverUrls} />
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.thumbEmpty]}>
            <Ionicons name="albums-outline" size={18} color={theme.colors.mist} />
          </View>
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={styles.rowSub}>
          {t('components.pickerProductCount', { count: collection.productCount })}
        </Text>
      </View>
      <View style={[styles.check, selected && styles.checkActive]}>
        {selected ? <Ionicons name="checkmark" size={14} color={theme.colors.cream} /> : null}
      </View>
    </Pressable>
  );
}

function CoverMosaic({ urls }: { urls: string[] }) {
  // 1, 2, 3+ ürün için farklı layout
  if (urls.length === 1) {
    return (
      <View style={styles.mosaicSingle}>
        <CoverImage src={urls[0] ?? ''} />
      </View>
    );
  }
  if (urls.length === 2) {
    return (
      <View style={styles.mosaicRow}>
        <View style={styles.mosaicHalf}>
          <CoverImage src={urls[0] ?? ''} />
        </View>
        <View style={styles.mosaicHalf}>
          <CoverImage src={urls[1] ?? ''} />
        </View>
      </View>
    );
  }
  // 3 veya 4
  return (
    <View style={styles.mosaicGrid}>
      <View style={styles.mosaicQuarter}>
        <CoverImage src={urls[0] ?? ''} />
      </View>
      <View style={styles.mosaicQuarter}>
        <CoverImage src={urls[1] ?? ''} />
      </View>
      <View style={styles.mosaicQuarter}>
        <CoverImage src={urls[2] ?? ''} />
      </View>
      <View style={styles.mosaicQuarter}>{urls[3] ? <CoverImage src={urls[3]} /> : null}</View>
    </View>
  );
}

function CoverImage({ src }: { src: string }) {
  return <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.cream },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.mist,
  },
  cancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 1.5,
    color: theme.colors.inkMute,
  },
  headerTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 20,
    color: theme.colors.ink,
  },
  save: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 1.5,
    color: theme.colors.gold,
  },
  saveDisabled: {
    color: theme.colors.inkFaint,
  },
  list: {
    paddingVertical: 8,
    paddingBottom: 40,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  newIcon: {
    width: 48,
    height: 48,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.gold,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newText: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    color: theme.colors.gold,
  },
  createWrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  createLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 2,
    color: theme.colors.ink,
  },
  createInput: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: theme.colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.mist,
    paddingVertical: 8,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: theme.colors.clay,
  },
  createActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  createBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.mist,
  },
  createBtnPrimary: {
    backgroundColor: theme.colors.bordo,
    borderColor: theme.colors.bordo,
  },
  createBtnText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: 2,
    color: theme.colors.ink,
  },
  createBtnTextPrimary: {
    color: theme.colors.cream,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.mist,
    marginVertical: 4,
  },
  loading: { paddingVertical: 40, alignItems: 'center' },
  empty: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 16,
    color: theme.colors.inkMute,
    textAlign: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: theme.colors.mist,
  },
  thumbImageHolder: {},
  thumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.creamSoft,
  },
  mosaicSingle: { flex: 1 },
  mosaicRow: { flex: 1, flexDirection: 'row' },
  mosaicHalf: { flex: 1 },
  mosaicGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  mosaicQuarter: { width: '50%', height: '50%' },
  rowText: { flex: 1, gap: 4 },
  rowTitle: {
    fontFamily: 'Newsreader_400Regular',
    fontSize: 18,
    color: theme.colors.ink,
  },
  rowSub: {
    ...theme.type.micro,
    color: theme.colors.inkFaint,
    letterSpacing: 1.5,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    backgroundColor: theme.colors.gold,
    borderColor: theme.colors.gold,
  },
});
