import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL ?? 'postgresql://butika:butika@localhost:5432/butika';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
