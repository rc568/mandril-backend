import { createRequire } from 'node:module';
import { sql } from 'drizzle-orm';
import { db } from '@/shared/db';
import * as schema from '@/shared/db/schemas';
import { assertTestDatabase } from './database';

// Drizzle Kit's CommonJS entry supports its internal Node.js requires.
const { generateDrizzleJson, generateMigration } = createRequire(import.meta.url)(
  'drizzle-kit/api',
) as typeof import('drizzle-kit/api');

export async function resetTestSchema() {
  // Only this project's disposable database is reset; the guard lives outside public.
  await assertTestDatabase();
  const statements = await generateMigration(
    generateDrizzleJson({}, undefined, undefined, 'snake_case'),
    generateDrizzleJson(schema, undefined, undefined, 'snake_case'),
  );
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
    for (const statement of statements) await tx.execute(sql.raw(statement));
  });
}
