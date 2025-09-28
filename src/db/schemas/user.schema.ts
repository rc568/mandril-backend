import { boolean, pgEnum, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { USER_ROLES } from '../../domain/constants';
import { softDelete } from '../helpers/columns.helpers';

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
  isActive: boolean().default(true).notNull(),
  ...softDelete,
});
