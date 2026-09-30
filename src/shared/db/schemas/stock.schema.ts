import { sql } from 'drizzle-orm';
import {
  check,
  decimal,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { INVENTORY_BUCKET, STOCK_MOVEMENT_TYPE } from '@/modules/inventory/domain/constants';
import { softDelete } from '../utils/drizzle-columns';
import { orderTable } from './order.schema';
import { productVariantTable } from './product.schema';
import { userAudit } from './shared';
import { supplierOrderReceiptItemTable, supplierOrderTable } from './supplier.schema';
import { userTable } from './user.schema';

export { STOCK_MOVEMENT_TYPE } from '@/modules/inventory/domain/constants';

export const stockMovementTypeEnum = pgEnum('stock_movement_type', STOCK_MOVEMENT_TYPE);
export const inventoryBucketEnum = pgEnum('inventory_bucket', INVENTORY_BUCKET);

export const inventoryBalanceTable = pgTable(
  'inventory_balance',
  {
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    bucket: inventoryBucketEnum().notNull(),
    quantity: integer().default(0).notNull(),
    // The balance stores the latest state; stock movements preserve the operation history.
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    updatedBy: uuid()
      .references(() => userTable.id)
      .notNull(),
  },
  (t) => [
    primaryKey({ name: 'inventory_balance_pk', columns: [t.productVariantId, t.bucket] }),
    check('inventory_balance_quantity_check', sql`${t.quantity} >= 0`),
  ],
);

export const stockMovementTable = pgTable(
  'stock_movement',
  {
    id: uuid().defaultRandom().primaryKey(),
    productVariantId: smallint()
      .references(() => productVariantTable.id)
      .notNull(),
    type: stockMovementTypeEnum().notNull(),
    quantity: integer().notNull(),
    orderId: uuid().references(() => orderTable.id),
    purchaseId: uuid().references(() => supplierOrderTable.id),
    // Existing sales and historical movements do not have receipt details.
    supplierOrderReceiptItemId: uuid().references(() => supplierOrderReceiptItemTable.id),
    fromBucket: inventoryBucketEnum(),
    toBucket: inventoryBucketEnum(),
    // Snapshot of the final cost applied when posting the receipt, including zero-cost units.
    unitCostPen: decimal({ precision: 12, scale: 6 }),
    note: text(),
    ...softDelete,
    ...userAudit,
  },
  (t) => [
    // Keep the uniqueness even if legacy soft-delete fields are present.
    uniqueIndex('stock_movement_receipt_item_bucket_idx')
      .on(t.supplierOrderReceiptItemId, t.toBucket)
      .where(sql`${t.supplierOrderReceiptItemId} IS NOT NULL`),
    check('stock_movement_unit_cost_check', sql`${t.unitCostPen} >= 0`),
    check(
      'stock_movement_reservation_check',
      sql`
      ${t.type} NOT IN ('RESERVATION', 'RESERVATION_RELEASE') OR (
        ${t.orderId} IS NOT NULL AND ${t.purchaseId} IS NULL AND ${t.supplierOrderReceiptItemId} IS NULL
        AND ${t.quantity} > 0 AND ${t.fromBucket} IS NOT NULL AND ${t.toBucket} IS NOT NULL
        AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL
        AND ((${t.type} = 'RESERVATION' AND ${t.fromBucket} = 'AVAILABLE' AND ${t.toBucket} = 'RESERVED')
          OR (${t.type} = 'RESERVATION_RELEASE' AND ${t.fromBucket} = 'RESERVED' AND ${t.toBucket} = 'AVAILABLE'))
      )
    `,
    ),
    check(
      'stock_movement_order_source_check',
      sql`
      ${t.fromBucket} IS NULL OR ${t.type} = 'ADJUSTMENT' OR (
        ${t.orderId} IS NOT NULL AND ${t.purchaseId} IS NULL AND ${t.supplierOrderReceiptItemId} IS NULL
        AND ${t.quantity} > 0 AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL
        AND (${t.type} IN ('RESERVATION', 'RESERVATION_RELEASE')
          OR (${t.type} = 'SALE' AND ${t.fromBucket} IN ('AVAILABLE', 'RESERVED') AND ${t.toBucket} IS NULL
            AND ${t.unitCostPen} IS NOT NULL))
      )
    `,
    ),
    check(
      'stock_movement_adjustment_check',
      sql`${t.type} <> 'ADJUSTMENT' OR (${t.fromBucket} IS NULL AND ${t.toBucket} IS NULL) OR (
        ${t.orderId} IS NULL AND ${t.purchaseId} IS NULL AND ${t.supplierOrderReceiptItemId} IS NULL
        AND ${t.quantity} > 0 AND ${t.unitCostPen} IS NOT NULL
        AND ${t.note} IS NOT NULL AND length(trim(${t.note})) > 0
        AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL
        AND ((${t.fromBucket} IS NULL AND ${t.toBucket} IS NOT NULL AND ${t.toBucket} IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE'))
          OR (${t.toBucket} IS NULL AND ${t.fromBucket} IS NOT NULL AND ${t.fromBucket} IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')))
      )`,
    ),
    check(
      'stock_movement_return_destination_check',
      sql`${t.type} <> 'RETURN' OR ${t.toBucket} IS NULL OR (
        ${t.fromBucket} IS NULL AND ${t.toBucket} IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')
        AND ${t.orderId} IS NOT NULL AND ${t.purchaseId} IS NULL AND ${t.supplierOrderReceiptItemId} IS NULL
        AND ${t.quantity} > 0 AND ${t.unitCostPen} IS NOT NULL
        AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL
      )`,
    ),
    check(
      'stock_movement_receipt_entry_check',
      sql`
    ${t.supplierOrderReceiptItemId} IS NULL OR (
    ${t.type} = 'PURCHASE' AND ${t.purchaseId} IS NOT NULL AND ${t.orderId} IS NULL AND ${t.fromBucket} IS NULL
      AND ${t.toBucket} IS NOT NULL AND ${t.toBucket} IN ('AVAILABLE', 'DEFECTIVE')
      AND ${t.quantity} > 0 AND ${t.unitCostPen} IS NOT NULL
      AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL
    )
  `,
    ),
  ],
);
