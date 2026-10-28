import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return drizzle(client, { schema, casing: 'snake_case' });
}

export { schema };
