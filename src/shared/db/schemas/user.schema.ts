import { type AnyPgColumn, boolean, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { USER_ROLES } from '@/shared/auth';

export const userRoleEnum = pgEnum('user_role', USER_ROLES);

export const userTable = pgTable('user', {
  id: uuid().defaultRandom().primaryKey(),
  name: varchar({ length: 100 }).notNull(),
  lastName: varchar({ length: 100 }).notNull(),
  password: varchar({ length: 128 }).notNull(),
  userName: varchar({ length: 50 }).notNull().unique(),
  email: varchar({ length: 255 }).notNull().unique(),
  isEmailVerified: boolean().default(false).notNull(),
  role: userRoleEnum().default('employee').notNull(),
  refreshToken: varchar(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  deletedAt: timestamp({ withTimezone: true }),
  createdBy: uuid().references((): AnyPgColumn => userTable.id),
  updatedBy: uuid().references((): AnyPgColumn => userTable.id),
  deletedBy: uuid().references((): AnyPgColumn => userTable.id),
});
