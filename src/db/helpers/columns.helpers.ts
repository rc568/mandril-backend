import { type AnyPgColumn, type PgTableWithColumns, timestamp, uuid } from 'drizzle-orm/pg-core';

export const timestamps = {
  updatedAt: timestamp().$onUpdate(() => new Date()),
  createdAt: timestamp().defaultNow().notNull(),
};

export const softDelete = {
  ...timestamps,
  deletedAt: timestamp(),
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
