import { type AnyPgColumn, type PgTableWithColumns, timestamp, uuid } from 'drizzle-orm/pg-core';

export const timestamps = {
  updatedAt: timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
};

export const softDelete = {
  ...timestamps,
  deletedAt: timestamp({ withTimezone: true }),
};

type TableWithId = PgTableWithColumns<{
  name: any;
  columns: {
    id: AnyPgColumn;
  };
  schema: any;
  dialect: any;
}>;

export const userAudit = (userTable: TableWithId) => ({
  updatedBy: uuid().references(() => userTable.id),
  createdBy: uuid()
    .references(() => userTable.id)
    .notNull(),
  deletedBy: uuid().references(() => userTable.id),
});
