// LOCAL TEST ONLY. Loads the boutique list and categories from the project's CSV
// exports (butikler.csv, butik_kategorileri.csv; they are not in git) into the
// local test database, so real boutique pages can be opened and saved.
// Run from apps/api:
//   bun scripts/local-test/seed-catalog.ts <butikler.csv> <butik_kategorileri.csv>
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { localTestDatabaseUrl } from './local-db';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
const readCsv = (path: string) => parseCsv(stripBom(readFileSync(path, 'utf8')));
const slugify = (name: string) => name.toLocaleLowerCase('tr-TR')
  .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let sql: ReturnType<typeof postgres> | undefined;
try {
  const url = localTestDatabaseUrl();
  const [boutiquesCsv, categoriesCsv] = process.argv.slice(2);
  if (!boutiquesCsv || !categoriesCsv) {
    throw new Error('Kullanım: bun scripts/local-test/seed-catalog.ts <butikler.csv> <butik_kategorileri.csv>');
  }
  const [, ...boutiqueRows] = readCsv(boutiquesCsv); // butik_id,butik_adi,site_url,pazar
  const [, ...categoryRows] = readCsv(categoriesCsv); // butik_id,butik_adi,kategoriler ("|" ile ayrılmış)
  sql = postgres(url, { max: 1, onnotice: () => {} });

  const markets = [...new Set(boutiqueRows.map((r) => r[3]!.trim()))];
  for (const code of markets) {
    await sql`insert into countries (code, name, default_language)
      values (${code}, ${code === 'TR' ? 'Türkiye' : code}, ${code === 'TR' ? 'tr' : 'en'}) on conflict do nothing`;
  }
  for (const [index, [id, name, site, market]] of boutiqueRows.entries()) {
    await sql`insert into boutiques (id, country_code, name, url, cover_image_url, sort_order)
      values (${id!.trim()}, ${market!.trim()}, ${name!.trim()}, ${site!.trim()}, '', ${index})
      on conflict (id) do update set name = excluded.name, url = excluded.url`;
  }
  const names = [...new Set(categoryRows.flatMap((r) => (r[2] ?? '').split('|').map((c) => c.trim()).filter(Boolean)))];
  const categoryIds = new Map<string, string>();
  for (const [index, name] of names.entries()) {
    const [category] = await sql`insert into categories (country_code, slug, name, sort_order)
      values ('TR', ${slugify(name)}, ${name}, ${index + 10})
      on conflict (country_code, slug) do update set name = excluded.name returning id`;
    categoryIds.set(name, category!.id);
  }
  const known = new Set(boutiqueRows.map((r) => r[0]!.trim()));
  for (const [index, row] of categoryRows.entries()) {
    const boutiqueId = row[0]!.trim();
    if (!known.has(boutiqueId)) continue;
    for (const name of (row[2] ?? '').split('|').map((c) => c.trim()).filter(Boolean)) {
      await sql`insert into boutique_categories (boutique_id, category_id, sort_order)
        values (${boutiqueId}, ${categoryIds.get(name)!}, ${index}) on conflict do nothing`;
    }
  }
  const [counts] = await sql`select (select count(*)::int from boutiques) as boutiques,
    (select count(*)::int from categories) as categories, (select count(*)::int from boutique_categories) as links`;
  console.log(`${counts!.boutiques} butik, ${counts!.categories} kategori, ${counts!.links} butik-kategori bağlantısı yüklendi.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql?.end();
}
