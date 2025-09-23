import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import envs from '../config/envs';
import * as schema from '../db/schemas';

const pool = new Pool({
  connectionString: envs.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
});

export const db = drizzle(pool, { casing: 'snake_case', schema });

export const successConnectionDb = async () => {
  try {
    await db.execute('SELECT 1');
  } catch (error) {
    console.error(error);
    console.error('Error connecting to database...');
    process.exit(1);
  }
};

export type Transaction = PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type Executor = typeof db | Transaction;
