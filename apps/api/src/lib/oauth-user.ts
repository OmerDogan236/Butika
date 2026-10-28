import { type User, users } from '@butika/db';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';

interface OAuthInput {
  provider: 'apple' | 'google';
  sub: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  avatar?: string;
}

// OAuth girişinde kullanıcıyı bul-veya-oluştur.
// - provider sub ile eşleşen kullanıcı varsa: onu döndür (ad/e-postayı null ile EZME).
// - yoksa ama aynı DOĞRULANMIŞ e-posta başka bir hesapta varsa: o hesaba bu provider'ı BAĞLA.
// - hiçbiri yoksa: yeni kullanıcı oluştur.
//
// GÜVENLİK: E-posta yalnızca provider onu DOĞRULADIYSA (email_verified) kullanılır.
// Doğrulanmamış e-posta ne birleştirmede kullanılır ne de kaydedilir — aksi halde
// saldırgan, doğrulanmamış e-posta ile kurbanın hesabına bağlanabilir (account takeover).
export async function findOrCreateOAuthUser(input: OAuthInput): Promise<User> {
  const subCol = input.provider === 'apple' ? users.appleSub : users.googleSub;
  const subKey = input.provider === 'apple' ? 'appleSub' : 'googleSub';
  // Yalnızca doğrulanmış e-postaya güven.
  const trustedEmail = input.emailVerified ? input.email : undefined;

  // 1) provider sub ile eşleşen kullanıcı
  const [bySub] = await db
    .select()
    .from(users)
    .where(and(eq(subCol, input.sub), isNull(users.deletedAt)))
    .limit(1);

  if (bySub) {
    // Google her girişte e-posta/ad döndürür → boş alanları tamamla (mevcut değeri EZME).
    const patch: Partial<typeof users.$inferInsert> = { lastSeenAt: new Date() };
    if (!bySub.email && trustedEmail) patch.email = trustedEmail;
    if (!bySub.avatarUrl && input.avatar) patch.avatarUrl = input.avatar;
    await db.update(users).set(patch).where(eq(users.id, bySub.id));
    return { ...bySub, ...patch } as User;
  }

  // 2) aynı DOĞRULANMIŞ e-posta ile mevcut hesap → hesap birleştirme
  if (trustedEmail) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, trustedEmail), isNull(users.deletedAt)))
      .limit(1);
    if (byEmail) {
      const patch: Partial<typeof users.$inferInsert> = {
        [subKey]: input.sub,
        lastSeenAt: new Date(),
      };
      if (!byEmail.avatarUrl && input.avatar) patch.avatarUrl = input.avatar;
      await db.update(users).set(patch).where(eq(users.id, byEmail.id));
      return { ...byEmail, ...patch } as User;
    }
  }

  // 3) yeni kullanıcı — doğrulanmamış e-posta KAYDEDİLMEZ (sonradan yanlış eşleşmeyi önler).
  const displayName = input.name?.trim() || trustedEmail?.split('@')[0] || 'Misafir';
  const [created] = await db
    .insert(users)
    .values({
      [subKey]: input.sub,
      email: trustedEmail ?? null,
      displayName,
      avatarUrl: input.avatar ?? null,
    })
    .returning();
  if (!created) throw new Error('user creation failed');
  return created;
}
