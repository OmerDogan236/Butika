// Mağaza inceleme girişi (tek dokunuşla ortak review@ hesabına giriş) Türkiye'den görünmez.
// 27 Eki bulgusu: şalter açıkken gerçek kullanıcılar "İnceleme Girişi"ne basıp ortak hesaba
// giriyordu; hesap ekip listesinde olduğu için ölçüm de kapanıyordu (kayıt "durdu" görünüyordu).
// Apple ve Google inceleyicileri yurt dışından bağlanır; ülke bilinmiyorsa (yerel) açık kalır.
export function incelemeGirisiAcikMi(salter: boolean, ulke: string | null): boolean {
  return salter && ulke !== 'TR';
}
