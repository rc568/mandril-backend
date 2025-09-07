import { drizzle } from 'drizzle-orm/node-postgres';
import envs from '../config/envs';
import * as schema from '../db/schemas';

export const db = drizzle({ connection: envs.DATABASE_URL, casing: 'snake_case', schema });

export const successConnectionDb = async () => {
  try {
    await db.execute('SELECT 1');
  } catch (error) {
    console.error(error);
    console.error('Error connecting to database...');
    process.exit(1);
  }
};
