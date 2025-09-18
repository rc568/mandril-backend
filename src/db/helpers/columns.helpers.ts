import { timestamp } from 'drizzle-orm/pg-core';

export const timestamps = {
  updated_at: timestamp().$onUpdate(() => new Date()),
  created_at: timestamp().defaultNow().notNull(),
};

export const softDelete = {
  ...timestamps,
  deleted_at: timestamp(),
};
