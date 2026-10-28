import { type TarzTestiGonder, tarzTestiGonderSchema } from '@butika/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Gönderilemeyen tarz testi cevabı telefonda kullanıcı başına saklanır; sonraki açılışta
// yeniden gönderilir (spec §4). Kullanıcı bekletilmez.
const anahtar = (userId: string) => `butika.kisisel.${userId}.bekleyen`;

export async function bekleyenCevapKaydet(userId: string, g: TarzTestiGonder): Promise<void> {
  try {
    await AsyncStorage.setItem(anahtar(userId), JSON.stringify(g));
  } catch {
    // yut — saklanamazsa cevap kaybolur ama akış bozulmaz
  }
}

export async function bekleyenCevabiOku(userId: string): Promise<TarzTestiGonder | null> {
  try {
    const ham = await AsyncStorage.getItem(anahtar(userId));
    if (!ham) return null;
    const sonuc = tarzTestiGonderSchema.safeParse(JSON.parse(ham));
    return sonuc.success ? sonuc.data : null;
  } catch {
    return null;
  }
}

export async function bekleyenCevabiSil(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(anahtar(userId));
  } catch {
    // yut
  }
}
