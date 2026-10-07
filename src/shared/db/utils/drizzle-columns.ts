import { type AnyPgColumn, type PgTableWithColumns, timestamp, uuid } from 'drizzle-orm/pg-core';

type TableWithId = PgTableWithColumns<{
  name: any;
  columns: {
    id: AnyPgColumn;
  };
  schema: any;
  dialect: any;
}>;

export const creationAudit = (userTable: TableWithId) => ({
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  createdBy: uuid()
    .references(() => userTable.id)
    .notNull(),
});

export const updateAudit = (userTable: TableWithId) => ({
  ...creationAudit(userTable),
  updatedAt: timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  updatedBy: uuid().references(() => userTable.id),
});

export const softDeleteAudit = (userTable: TableWithId) => ({
  ...updateAudit(userTable),
  deletedAt: timestamp({ withTimezone: true }),
  deletedBy: uuid().references(() => userTable.id),
});

export const modificationAudit = (userTable: TableWithId) => ({
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  updatedBy: uuid()
    .references(() => userTable.id)
    .notNull(),
});
