// Bir Instagram hesabının herkese açık işletme bilgisi (ad, biyografideki web sitesi).
// Meta'nın resmi "business discovery" servisi: Butika'nın kendi işletme hesabı üzerinden
// başka işletme/üretici hesaplarının herkese açık alanları okunur. Instagram sayfası kazınmaz.
// Kişisel hesaplar bu serviste görünmez → null (butik değil sayılır).
// META_IG_USER_ID / META_GRAPH_TOKEN girilmemişse servis kapalıdır (yapilandirildiMi false).

import { env } from '../env';
import { logger } from './logger';

export interface InstagramProfili {
  hesap: string;
  ad: string | null;
  website: string | null;
  biyografi: string | null;
}

const GRAPH = 'https://graph.facebook.com/v21.0';

interface MetaAyari {
  igUserId?: string;
  token?: string;
}

const ortamAyari = (): MetaAyari => ({ igUserId: env.META_IG_USER_ID, token: env.META_GRAPH_TOKEN });

export function instagramServisiAcikMi(ayar: MetaAyari = ortamAyari()): boolean {
  return Boolean(ayar.igUserId && ayar.token);
}

export async function instagramProfili(
  hesap: string,
  deps: { fetch?: typeof fetch; ayar?: MetaAyari } = {},
): Promise<InstagramProfili | null> {
  const ayar = deps.ayar ?? ortamAyari();
  if (!instagramServisiAcikMi(ayar)) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(hesap)) return null;
  const alanlar = `business_discovery.username(${hesap}){username,name,website,biography}`;
  const url = `${GRAPH}/${encodeURIComponent(ayar.igUserId!)}?fields=${encodeURIComponent(alanlar)}`;
  try {
    const yanit = await (deps.fetch ?? fetch)(url, {
      headers: { Authorization: `Bearer ${ayar.token}` },
      signal: AbortSignal.timeout(8_000),
    });
    const govde = (await yanit.json().catch(() => null)) as {
      business_discovery?: { username?: string; name?: string; website?: string; biography?: string };
      error?: { code?: number; message?: string };
    } | null;
    if (!yanit.ok || !govde?.business_discovery) {
      // 110 = hesap bulunamadı ya da işletme/üretici hesabı değil: butik değil sayılır.
      if (govde?.error?.code !== 110) logger.warn({ hesap, hata: govde?.error }, 'instagram profili okunamadı');
      return null;
    }
    const b = govde.business_discovery;
    const website = b.website?.trim() || null;
    return {
      hesap: (b.username ?? hesap).toLowerCase(),
      ad: b.name?.trim() || null,
      website: website && /^https?:\/\//i.test(website) ? website : website ? `https://${website}` : null,
      biyografi: b.biography?.trim() || null,
    };
  } catch (err) {
    logger.warn({ err, hesap }, 'instagram profili: istek başarısız');
    return null;
  }
}
