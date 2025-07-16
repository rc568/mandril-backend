import { drizzle } from 'drizzle-orm/node-postgres';
import envs from '../config/envs';

export const db = drizzle({ connection: envs.DATABASE_URL, casing: 'snake_case' });
