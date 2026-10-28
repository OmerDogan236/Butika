import { consentRecords } from '@butika/db';
import type { ConsentSubmit, ConsentType } from '@butika/types';
import { and, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from './db';
import { getClientIp, getUserAgent } from './request-info';

// Ortak rıza kaydedici — web formu, çerez bandı ve mobil kayıt HEPSİ bunu kullanır.
// IP/User-Agent istemciden DEĞİL, sunucudaki header'lardan alınır (güvenli).
// Her onay kararı ayrı bir satır olarak eklenir (ekle-only ispat defteri).
export async function recordConsents(c: Context, input: ConsentSubmit): Promise<number> {
  const ipAddress = getClientIp(c);
  const userAgent = getUserAgent(c);

  const rows = input.consents.map((item) => ({
    email: input.email?.trim().toLowerCase() || null,
    userId: input.userId ?? null,
    visitorId: input.visitorId ?? null,
    consentType: item.type,
    granted: item.granted,
    textVersion: input.textVersion,
    source: input.source,
    ipAddress,
    userAgent,
    locale: input.locale ?? null,
  }));

  await db.insert(consentRecords).values(rows);
  return rows.length;
}

// Kullanıcının bir onay türü için verdiği SON karar (defter ekle-only olduğundan en yeni satır
// geçerlidir). Hiç kayıt yoksa false.
export async function hasGrantedConsent(userId: string, type: ConsentType): Promise<boolean> {
  const [latest] = await db
    .select({ granted: consentRecords.granted })
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.consentType, type)))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return latest?.granted === true;
}
