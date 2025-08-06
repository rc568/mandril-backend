import { timestamp } from 'drizzle-orm/pg-core';

export const timestamps = {
  updated_at: timestamp(),
  created_at: timestamp().defaultNow().notNull(),
};

export const softDelete = {
  ...timestamps,
  deleted_at: timestamp(),
};
