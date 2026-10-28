import argon2 from 'argon2';
import { createDb } from './client';
import { adminUsers, categories, countries } from './schema';

const url = process.env.DATABASE_URL ?? 'postgresql://butika:butika@localhost:5432/butika';
const db = createDb(url);

console.log('[seed] ensuring TR market…');
await db
  .insert(countries)
  .values({ code: 'TR', name: 'Türkiye', defaultLanguage: 'tr', sortOrder: 0 })
  .onConflictDoNothing({ target: countries.code });

const defaultCategories = [
  { countryCode: 'TR', slug: 'giyim', name: 'Giyim', sortOrder: 1 },
  { countryCode: 'TR', slug: 'aksesuar', name: 'Aksesuar', sortOrder: 2 },
  { countryCode: 'TR', slug: 'guzellik', name: 'Güzellik', sortOrder: 3 },
  { countryCode: 'TR', slug: 'mucevher', name: 'Mücevher', sortOrder: 4 },
];

console.log('[seed] inserting default categories…');
for (const cat of defaultCategories) {
  await db
    .insert(categories)
    .values(cat)
    .onConflictDoNothing({ target: [categories.countryCode, categories.slug] });
}

const adminEmail = process.env.ADMIN_INITIAL_EMAIL ?? 'admin@butika.local';
const adminPw = process.env.ADMIN_INITIAL_PASSWORD ?? 'change-me-now';

console.log(`[seed] ensuring admin user "${adminEmail}"…`);
const passwordHash = await argon2.hash(adminPw, { type: argon2.argon2id });
await db
  .insert(adminUsers)
  .values({ email: adminEmail, passwordHash, displayName: 'Admin' })
  .onConflictDoNothing({ target: adminUsers.email });

console.log('[seed] complete');
process.exit(0);
