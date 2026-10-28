// Ekip (iç) hesapları: sahibin ve geliştiricinin kendi kullanımı ölçümlere girmesin.
// Mobil uygulama bu hesaplarla girişte PostHog kaydını tümüyle kapatır (olay da oturum
// kaydı da gitmez); admin panosu da bu hesapları sayılardan çıkarır.
// App Review hesabı sunucuda env.REVIEW_AUTH_EMAIL ile ayrıca eklenir.
export const IC_HESAP_EPOSTALARI: readonly string[] = [
  'kurucu@example.com',
  'dev@butika.local',
  'review@butika.ai',
];

export function icHesapMi(email: string | null | undefined): boolean {
  if (!email) return false;
  return IC_HESAP_EPOSTALARI.includes(email.trim().toLowerCase());
}
