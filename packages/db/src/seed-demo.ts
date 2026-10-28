// Demo seed: editorial Unsplash kapaklarıyla örnek butikler.
// `pnpm db:seed:demo` ile çalıştırılır. Idempotent — aynı isimle var olan butikleri atlar.
import { and, eq } from 'drizzle-orm';
import { createDb } from './client';
import { boutiqueCategories, boutiques, categories } from './schema';

// Demo seed yalnız TR pazarına yazar.
const MARKET = 'TR';

const url = process.env.DATABASE_URL ?? 'postgresql://butika:butika@localhost:5432/butika';
const db = createDb(url);

const u = (id: string) => `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;

const demoBoutiques = [
  // Giyim
  {
    categorySlugs: ['giyim'],
    name: 'Maison Velvet',
    description: 'İpek ve kadife — modern bir Vogue editorial hissi.',
    url: 'https://example.com/maison-velvet',
    cover: u('photo-1490481651871-ab68de25d43d'),
    sortOrder: 1,
  },
  {
    categorySlugs: ['giyim', 'aksesuar'],
    name: 'Linen & Sage',
    description: 'Doğal ketenler, toprak tonları, sıcak siluetler.',
    url: 'https://example.com/linen-sage',
    cover: u('photo-1483985988355-763728e1935b'),
    sortOrder: 2,
  },
  {
    categorySlugs: ['giyim'],
    name: 'Atölye 14',
    description: 'Sınırlı sayı el dikimi ceketler ve elbiseler.',
    url: 'https://example.com/atolye-14',
    cover: u('photo-1469334031218-e382a71b716b'),
    sortOrder: 3,
  },
  // Aksesuar
  {
    categorySlugs: ['aksesuar'],
    name: 'Mezzo Foulard',
    description: 'Tek tek dokunmuş ipek eşarplar.',
    url: 'https://example.com/mezzo',
    cover: u('photo-1591561954557-26941169b49e'),
    sortOrder: 1,
  },
  {
    categorySlugs: ['aksesuar', 'mucevher'],
    name: 'Sten Studio',
    description: 'Mat deri çantalar — yapısal ama yumuşak.',
    url: 'https://example.com/sten',
    cover: u('photo-1547949003-9792a18a2601'),
    sortOrder: 2,
  },
  // Güzellik
  {
    categorySlugs: ['guzellik'],
    name: 'Selene',
    description: 'Botanik bazlı cilt bakımı — sabah ritüelin için.',
    url: 'https://example.com/selene',
    cover: u('photo-1556228720-195a672e8a03'),
    sortOrder: 1,
  },
  {
    categorySlugs: ['guzellik'],
    name: 'Petal & Pearl',
    description: 'Editorial parfümler ve mum koleksiyonu.',
    url: 'https://example.com/petal-pearl',
    cover: u('photo-1571781926291-c477ebfd024b'),
    sortOrder: 2,
  },
  // Mücevher
  {
    categorySlugs: ['mucevher'],
    name: 'Doré Atelier',
    description: '18 ayar altın — minimal ve zamansız.',
    url: 'https://example.com/dore',
    cover: u('photo-1535632066927-ab7c9ab60908'),
    sortOrder: 1,
  },
];

console.log('[seed-demo] kategoriler bulunuyor…');
const allCats = await db.select().from(categories).where(eq(categories.countryCode, MARKET));
const catBySlug = new Map(allCats.map((c) => [c.slug, c.id] as const));

console.log(`[seed-demo] ${demoBoutiques.length} butik ekleniyor…`);
let added = 0;
let skipped = 0;
for (const b of demoBoutiques) {
  const catIds = b.categorySlugs
    .map((s) => catBySlug.get(s))
    .filter((x): x is string => Boolean(x));
  if (catIds.length === 0) {
    console.warn(`  ⚠ kategori bulunamadı, atlandı: ${b.name}`);
    skipped++;
    continue;
  }
  // Aynı pazarda aynı isimde butik varsa atla.
  const existing = await db
    .select({ id: boutiques.id })
    .from(boutiques)
    .where(and(eq(boutiques.countryCode, MARKET), eq(boutiques.name, b.name)))
    .limit(1);
  if (existing.length > 0) {
    skipped++;
    continue;
  }
  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(boutiques)
      .values({
        countryCode: MARKET,
        name: b.name,
        description: b.description,
        url: b.url,
        coverImageUrl: b.cover,
        sortOrder: b.sortOrder,
        isActive: true,
      })
      .returning({ id: boutiques.id });
    if (!inserted) throw new Error(`butik eklenemedi: ${b.name}`);
    // Her kategoride aynı global sortOrder ile başlat (demo).
    for (const categoryId of catIds) {
      await tx
        .insert(boutiqueCategories)
        .values({ boutiqueId: inserted.id, categoryId, sortOrder: b.sortOrder });
    }
  });
  added++;
}

console.log(`[seed-demo] ${added} eklendi, ${skipped} atlandı.`);
process.exit(0);
