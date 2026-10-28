// "Paylaş… → Butika": telefonun paylaşım menüsündeki Butika penceresi (iOS Share Extension).
// Oturum anahtarları uygulamayla ortak anahtarlık grubunda (src/lib/storage.ts ORTAK_ANAHTARLIK).
/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'share',
  name: 'ButikaPaylas',
  displayName: 'Butika',
  icon: '../../assets/icon.png',
  deploymentTarget: '15.1',
  bundleIdentifier: '.paylas',
  frameworks: ['UniformTypeIdentifiers'],
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)app.butika.ortak'],
  },
};
