import { defineConfig } from 'drizzle-kit';
import envs from './src/config/envs';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: envs.DATABASE_URL,
  },
  casing: 'snake_case',
});
