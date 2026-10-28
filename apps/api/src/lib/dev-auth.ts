// /auth/dev doğrulamasız e-postayla her hesaba giriş verir: production'da asla,
// diğer ortamlarda yalnız DEV_AUTH_ENABLED açıkken (29 Eyl bulgusu: şalter kapalıyken de açıktı).
export function devGirisAcikMi(nodeEnv: string, devAuthEnabled: boolean): boolean {
  return nodeEnv !== 'production' && devAuthEnabled;
}
