// Koleksiyon ekranlarının metinleri (liste + detay + yeni + düzenle).
export const collectionsTr = {
  // Liste ekranı
  kicker: 'Koleksiyon',
  brand: 'Koleksiyonum',
  empty: 'Henüz koleksiyonun yok.\nİlk koleksiyonunu yarat.',
  newCta: 'Yeni koleksiyon',
  productCount: '{{count}} ÜRÜN',

  // Detay ekranı
  detailEmpty: "Bu koleksiyon henüz boş.\nWebView'da ürün kaydederken bu koleksiyonu seç.",
  // Menü (ActionSheet / Alert)
  menuEdit: 'Düzenle',
  menuDelete: 'Sil',
  menuCancel: 'İptal',
  // Üründen çıkar onayı
  removeTitle: 'Koleksiyondan çıkar',
  removeBody: '"{{title}}" bu koleksiyondan çıkarılsın mı? (Vitrinimden silinmez)',
  removeCancel: 'İptal',
  removeConfirm: 'Çıkar',
  // Koleksiyonu sil onayı
  deleteTitle: 'Koleksiyonu sil',
  deleteBody: '"{{name}}" silinsin mi? Ürünler vitrinimde kalır.',
  deleteCancel: 'İptal',
  deleteConfirm: 'Sil',

  // Yeni koleksiyon ekranı
  newKicker: 'Yeni Koleksiyon',
  newTitleLine1: 'Bir\n',
  newTitleItalic: 'moodboard',
  newTitleLine2: ' yarat.',
  newDesc: 'Kaydettiklerini "Davet", "Hediye fikirleri" gibi temalara ayır.',
  nameLabel: 'Koleksiyon adı',
  namePlaceholder: "Örn. Yaz '26",
  descLabel: 'Açıklama',
  descOptional: 'opsiyonel',
  descPlaceholder: 'Bu koleksiyon hakkında bir kaç kelime…',
  creating: 'Yaratılıyor…',
  create: 'Yarat',

  // Düzenle ekranı
  editKicker: 'Düzenle',
  saving: 'Kaydediliyor…',
  save: 'Kaydet',

  // Doğrulama / hata mesajları (yeni + düzenle ortak)
  errNameTooShort: 'Ad en az 2 karakter olmalı',
  errNameTaken: 'Bu isimde bir koleksiyonun zaten var',
  errCreateFailed: 'Yaratılamadı, tekrar dene',
  errUpdateFailed: 'Güncellenemedi, tekrar dene',
} as const;

export const collectionsEn = {
  // Liste ekranı
  kicker: 'Collection',
  brand: 'My Collection',
  empty: "You don't have any collections yet.\nCreate your first collection.",
  newCta: 'New collection',
  productCount: '{{count}} ITEMS',

  // Detay ekranı
  detailEmpty:
    'This collection is empty.\nPick this collection when saving a product in the WebView.',
  // Menü (ActionSheet / Alert)
  menuEdit: 'Edit',
  menuDelete: 'Delete',
  menuCancel: 'Cancel',
  // Üründen çıkar onayı
  removeTitle: 'Remove from collection',
  removeBody: 'Remove "{{title}}" from this collection? (It stays in your showcase)',
  removeCancel: 'Cancel',
  removeConfirm: 'Remove',
  // Koleksiyonu sil onayı
  deleteTitle: 'Delete collection',
  deleteBody: 'Delete "{{name}}"? The products stay in your showcase.',
  deleteCancel: 'Cancel',
  deleteConfirm: 'Delete',

  // Yeni koleksiyon ekranı
  newKicker: 'New Collection',
  newTitleLine1: 'Create a\n',
  newTitleItalic: 'moodboard',
  newTitleLine2: '.',
  newDesc: 'Sort your saves into themes like "Party" or "Gift ideas".',
  nameLabel: 'Collection name',
  namePlaceholder: "e.g. Summer '26",
  descLabel: 'Description',
  descOptional: 'optional',
  descPlaceholder: 'A few words about this collection…',
  creating: 'Creating…',
  create: 'Create',

  // Düzenle ekranı
  editKicker: 'Edit',
  saving: 'Saving…',
  save: 'Save',

  // Doğrulama / hata mesajları (yeni + düzenle ortak)
  errNameTooShort: 'Name must be at least 2 characters',
  errNameTaken: 'You already have a collection with this name',
  errCreateFailed: "Couldn't create, try again",
  errUpdateFailed: "Couldn't update, try again",
} as const;
