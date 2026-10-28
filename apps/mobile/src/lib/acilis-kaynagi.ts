// Uygulamanın neden açıldığı: bildirime dokunarak (push), bir bağlantıyla (deeplink) ya da
// kendiliğinden (organic). app_open ve app_foregrounded olaylarına eklenir.
// Bildirim dokunuşu _layout'taki dinleyiciden, bağlantı +native-intent'ten buraya bildirilir;
// açılış olayı gönderilirken son birkaç saniyede gelen sinyal kullanılır ve tüketilir.
import { firstRouteSegment } from './deep-link';

/** Bir sinyal ancak bu kadar yeniyse açılışa bağlanır. */
export const SINYAL_PENCERESI_MS = 10_000;

export type AcilisKaynagi = Record<string, string> & { source: 'push' | 'deeplink' | 'organic' };

type Sinyal = { zaman: number; yuk: Record<string, string> };

let sonPush: Sinyal | null = null;
let sonLink: Sinyal | null = null;
// Soğuk açılışta "uygulamayı açan bildirim" sorgusu bitti mi (bkz. sogukPushKontrolBitti).
let sogukKontrolBitti = false;
const sogukKontrolBekleyenler: (() => void)[] = [];

const metin = (v: unknown, uzunluk = 100): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, uzunluk) : null;

/** Bildirim verisinden açılış özellikleri (kişisel bilgi taşımaz: tür, kampanya, olay kimliği). */
export function pushYuku(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const yuk: Record<string, string> = {};
  const tur = metin(data?.type);
  const kampanya = metin(data?.campaign);
  const olay = metin(data?.eventId);
  if (tur) yuk.push_type = tur;
  if (kampanya) yuk.push_campaign = kampanya;
  if (olay) yuk.push_event_id = olay;
  return yuk;
}

/** Bağlantıdaki utm_source / utm_medium / utm_campaign ve açtığı ekran. */
export function linkYuku(url: string): Record<string, string> {
  const yuk: Record<string, string> = {};
  const ekran = firstRouteSegment(url);
  if (ekran) yuk.link_screen = ekran.slice(0, 50);
  const sorgu = url.split('#')[0]?.split('?')[1] ?? '';
  for (const parca of sorgu.split('&')) {
    const [ad, deger = ''] = parca.split('=');
    if (ad !== 'utm_source' && ad !== 'utm_medium' && ad !== 'utm_campaign') continue;
    let cozulmus = deger;
    try {
      cozulmus = decodeURIComponent(deger.replace(/\+/g, ' '));
    } catch {
      // bozuk kodlama: ham değer
    }
    const v = metin(cozulmus);
    if (v) yuk[ad] = v;
  }
  return yuk;
}

export function pushAcilisiniBildir(
  data: Record<string, unknown> | null | undefined,
  simdi = Date.now(),
) {
  sonPush = { zaman: simdi, yuk: pushYuku(data) };
}

// Ana ekrandan açılışta da Expo Router kök adresi (butika:///) "ilk bağlantı" diye verir;
// ekran ya da utm taşımayan bağlantı açılış kaynağı sayılmaz.
export function linkAcilisiniBildir(url: string, simdi = Date.now()) {
  const yuk = linkYuku(url);
  if (Object.keys(yuk).length === 0) return;
  sonLink = { zaman: simdi, yuk };
}

/** Son sinyale göre açılış kaynağı; kullanılan sinyal silinir (bir sonraki açılışa taşınmaz). */
export function acilisKaynagiAl(simdi = Date.now()): AcilisKaynagi {
  const taze = (s: Sinyal | null) => s !== null && simdi - s.zaman <= SINYAL_PENCERESI_MS;
  let sonuc: AcilisKaynagi;
  // Bildirim önceliklidir: bildirim de bir bağlantı açabilir.
  if (taze(sonPush) && sonPush) sonuc = { source: 'push', ...sonPush.yuk };
  else if (taze(sonLink) && sonLink) sonuc = { source: 'deeplink', ...sonLink.yuk };
  else sonuc = { source: 'organic' };
  sonPush = null;
  sonLink = null;
  return sonuc;
}

/** _layout, uygulamayı açan bildirimi sorgulamayı bitirince çağırır. */
export function sogukPushKontrolBitti() {
  sogukKontrolBitti = true;
  for (const f of sogukKontrolBekleyenler.splice(0)) f();
}

/** Soğuk açılışta bildirim sorgusunu en fazla `ms` bekler; sonra kaynağı döndürür. */
export async function sogukAcilisKaynagi(ms = 1500): Promise<AcilisKaynagi> {
  if (!sogukKontrolBitti) {
    await new Promise<void>((coz) => {
      const t = setTimeout(coz, ms);
      sogukKontrolBekleyenler.push(() => {
        clearTimeout(t);
        coz();
      });
    });
  }
  return acilisKaynagiAl();
}

/** Yalnız testler için. */
export function _sifirla() {
  sonPush = null;
  sonLink = null;
  sogukKontrolBitti = false;
  sogukKontrolBekleyenler.length = 0;
}
