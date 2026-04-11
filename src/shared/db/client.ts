import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import envs from '@/config/envs';
import * as schema from '../db/schemas';

const pool = new Pool({
  connectionString: envs.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
});

export const db = drizzle(pool, { casing: 'snake_case', schema });
