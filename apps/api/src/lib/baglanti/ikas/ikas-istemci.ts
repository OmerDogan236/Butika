import { IkasSorguHatasi, IkasYetkiHatasi, type IkasTokenlari, ikasOAuth } from './ikas-oauth';

export { IkasSorguHatasi, IkasYetkiHatasi };

export const IKAS_GRAPHQL_ADRESI = 'https://api.myikas.com/api/v1/admin/graphql';
const YENILEME_ESIGI_MS = 5 * 60_000;
const ZAMAN_ASIMI_MS = 30_000;

export type IkasBaglanti = {
  magazaAdi: string;
  tokenlar: IkasTokenlari;
  /** Yenilenen çift kalıcı yazılsın diye çağrılır. */
  tokenlarDegisti?: (t: IkasTokenlari) => Promise<void>;
  /**
   * Aynı anahtarlı istemciler (aynı bağlantı) bu süreçte aynı anda tek yenileme yapar; diğerleri
   * onun sonucunu kullanır. Yenileme token'ı tek kullanımlık olduğundan ikinci istek reddedilirdi.
   */
  yenilemeKilidi?: string;
};

export type Ikas = { sorgu<T>(query: string, variables?: object): Promise<T> };

type GraphqlYaniti = { data?: unknown; errors?: { message?: string; extensions?: { code?: string } }[] };

const girisGerekli = (e: NonNullable<GraphqlYaniti['errors']>[number]) =>
  e.extensions?.code === 'LOGIN_REQUIRED' || e.message === 'LOGIN_REQUIRED';

// Süreç içi: bağlantı başına sürmekte olan yenileme.
const surenYenilemeler = new Map<string, Promise<IkasTokenlari>>();

export function ikasIstemci(baglanti: IkasBaglanti, fetchFn: typeof fetch = fetch): Ikas {
  let tokenlar = baglanti.tokenlar;
  // Anahtar verilmezse kilit yalnız bu istemcinin kendi eşzamanlı sorguları için.
  const kilitler = baglanti.yenilemeKilidi ? surenYenilemeler : new Map<string, Promise<IkasTokenlari>>();
  const kilit = baglanti.yenilemeKilidi ?? '';

  async function yenile(): Promise<void> {
    let suren = kilitler.get(kilit);
    if (!suren) {
      const eski = tokenlar.yenileme;
      suren = (async () => {
        const yeni = await ikasOAuth.tokenYenile(baglanti.magazaAdi, eski, fetchFn);
        await baglanti.tokenlarDegisti?.(yeni);
        return yeni;
      })().finally(() => kilitler.delete(kilit));
      kilitler.set(kilit, suren);
    }
    tokenlar = await suren;
  }

  /** `null` = yetki reddedildi (401 ya da LOGIN_REQUIRED). */
  async function tekIstek(query: string, variables: object): Promise<GraphqlYaniti | null> {
    let res: Response;
    try {
      res = await fetchFn(IKAS_GRAPHQL_ADRESI, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenlar.erisim}` },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      });
    } catch {
      throw new IkasSorguHatasi('ikas_ulasilamadi');
    }
    if (res.status === 401) return null;
    const govde = (await res.json().catch(() => null)) as GraphqlYaniti | null;
    // ikas doğrulama hatalarını HTTP 400 + `errors` ile döner; iletiler aşağıda hataya taşınır.
    if (!res.ok && !govde?.errors?.length) throw new IkasSorguHatasi(`ikas_http_${res.status}`);
    if (!govde) throw new IkasSorguHatasi('ikas_yanit_okunamadi');
    if (govde.errors?.some(girisGerekli)) return null;
    if (govde.errors?.length) {
      // Yalnız ikas'ın hata iletileri; istek başlığı/token mesaja girmez.
      throw new IkasSorguHatasi(govde.errors.map((e) => e.message ?? 'hata').join('; ').slice(0, 300));
    }
    if (govde.data == null) throw new IkasSorguHatasi('ikas_yanit_okunamadi');
    return govde;
  }

  return {
    async sorgu<T>(query: string, variables: object = {}): Promise<T> {
      if (new Date(tokenlar.bitisAt).getTime() - Date.now() < YENILEME_ESIGI_MS) await yenile();
      let yanit = await tekIstek(query, variables);
      if (!yanit) {
        await yenile();
        yanit = await tekIstek(query, variables);
        if (!yanit) throw new IkasYetkiHatasi('ikas_yetki_reddedildi');
      }
      return yanit.data as T;
    },
  };
}

/** Bağlanan uygulamanın ve mağazanın kimliği (alan adları: ikas denemesi notu). */
export async function ikasKimligi(ist: Ikas): Promise<{
  authorizedAppId: string;
  storeAppId: string;
  scope: string;
  deleted: boolean;
  merchantId: string;
}> {
  const d = await ist.sorgu<{
    getAuthorizedApp: { id: string; storeAppId: string; scope: string; deleted: boolean };
    getMerchant: { id: string; storeName: string };
  }>(`query { getAuthorizedApp { id storeAppId scope deleted } getMerchant { id storeName } }`);
  return {
    authorizedAppId: d.getAuthorizedApp.id,
    storeAppId: d.getAuthorizedApp.storeAppId,
    scope: d.getAuthorizedApp.scope,
    deleted: d.getAuthorizedApp.deleted,
    merchantId: d.getMerchant.id,
  };
}
