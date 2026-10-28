import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// __dirname workaround for ESM. Production'da container cwd /app olabilir,
// migrations'ı script'in kendi konumuna göre çöz.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsFolder = path.resolve(__dirname, '../drizzle');

const url = process.env.DATABASE_URL ?? 'postgresql://butika:butika@localhost:5432/butika';
const client = postgres(url, { max: 1 });
const db = drizzle(client);

console.log(`[db] applying migrations from ${migrationsFolder}`);
await migrate(db, { migrationsFolder });
await client.end();
console.log('[db] migrations applied');
