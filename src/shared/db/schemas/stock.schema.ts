import { integer, pgEnum, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { softDelete } from '../utils/drizzle-columns';
import { orderTable } from './order.schema';
import { productVariantTable } from './product.schema';
import { userAudit } from './shared';
import { supplierOrderTable } from './supplier.schema';

export const STOCK_MOVEMENT_TYPE = ['SALE', 'RETURN', 'PURCHASE', 'ADJUSTMENT'] as const;

export const stockMovementTypeEnum = pgEnum('stock_movement_type', STOCK_MOVEMENT_TYPE);

export const stockMovementTable = pgTable('stock_movement', {
  id: uuid().defaultRandom().primaryKey(),
  productVariantId: smallint()
    .references(() => productVariantTable.id)
    .notNull(),
  type: stockMovementTypeEnum().notNull(),
  quantity: integer().notNull(),
  orderId: uuid().references(() => orderTable.id),
  purchaseId: uuid().references(() => supplierOrderTable.id),
  note: text(),
  ...softDelete,
  ...userAudit,
});
