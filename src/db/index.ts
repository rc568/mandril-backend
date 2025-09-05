import { drizzle } from 'drizzle-orm/node-postgres';
import envs from '../config/envs';
import * as schema from '../db/schemas';

export const db = drizzle({ connection: envs.DATABASE_URL, casing: 'snake_case', schema });
