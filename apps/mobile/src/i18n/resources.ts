import { authEn, authTr } from './features/auth';
import { boutiqueEn, boutiqueTr } from './features/boutique';
import { butikcanEn, butikcanTr } from './features/butikcan';
import { collectionsEn, collectionsTr } from './features/collections';
import { commentsEn, commentsTr } from './features/comments';
import { commonEn, commonTr } from './features/common';
import { componentsEn, componentsTr } from './features/components';
import { detayliTestEn, detayliTestTr } from './features/detayliTest';
import { firsatEn, firsatTr } from './features/firsat';
import { kisiselEn, kisiselTr } from './features/kisisel';
import { notificationsEn, notificationsTr } from './features/notifications';
import { onboardingEn, onboardingTr } from './features/onboarding';
import { profileEn, profileTr } from './features/profile';
import { purchasesEn, purchasesTr } from './features/purchases';
import { savedEn, savedTr } from './features/saved';
import { searchEn, searchTr } from './features/search';
import { settingsEn, settingsTr } from './features/settings';
import { showcaseEn, showcaseTr } from './features/showcase';
import { paylasimEn, paylasimTr } from './features/paylasim';
import { suggestEn, suggestTr } from './features/suggest';
import { tabsEn, tabsTr } from './features/tabs';
import { tarzTestiEn, tarzTestiTr } from './features/tarzTesti';
import { turEn, turTr } from './features/tur';

// Her feature kendi dosyasında tr+en tutar; burada tek bir bundle'a toplanır.
// Yeni feature eklerken: features/<ad>.ts oluştur + buraya iki satır ekle.
export const resources = {
  tr: {
    translation: {
      common: commonTr,
      notifications: notificationsTr,
      auth: authTr,
      onboarding: onboardingTr,
      tabs: tabsTr,
      showcase: showcaseTr,
      saved: savedTr,
      purchases: purchasesTr,
      profile: profileTr,
      settings: settingsTr,
      firsat: firsatTr,
      boutique: boutiqueTr,
      collections: collectionsTr,
      comments: commentsTr,
      search: searchTr,
      suggest: suggestTr,
      paylasim: paylasimTr,
      butikcan: butikcanTr,
      components: componentsTr,
      tur: turTr,
      tarzTesti: tarzTestiTr,
      detayliTest: detayliTestTr,
      kisisel: kisiselTr,
    },
  },
  en: {
    translation: {
      common: commonEn,
      notifications: notificationsEn,
      auth: authEn,
      onboarding: onboardingEn,
      tabs: tabsEn,
      showcase: showcaseEn,
      saved: savedEn,
      purchases: purchasesEn,
      profile: profileEn,
      settings: settingsEn,
      firsat: firsatEn,
      boutique: boutiqueEn,
      collections: collectionsEn,
      comments: commentsEn,
      search: searchEn,
      suggest: suggestEn,
      paylasim: paylasimEn,
      butikcan: butikcanEn,
      components: componentsEn,
      tur: turEn,
      tarzTesti: tarzTestiEn,
      detayliTest: detayliTestEn,
      kisisel: kisiselEn,
    },
  },
} as const;
