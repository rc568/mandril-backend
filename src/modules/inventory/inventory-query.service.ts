import { and, asc, count, desc, eq, getTableColumns, gte, ilike, inArray, lte, or } from 'drizzle-orm';
import {
  db,
  inventoryBalanceTable,
  productTable,
  productVariantTable,
  stockMovementTable,
  userTable,
} from '@/shared/db';
import { calculatePagination } from '@/shared/utils';
import { INVENTORY_BUCKET } from './domain/constants';
import type { InventoryBalancesQuery, InventoryMovementsQuery } from './schemas/inventory.schema';

export class InventoryQueryService {
  getBalances = async (query: InventoryBalancesQuery) =>
    db.transaction(
      async (tx) => {
        const conditions = and(
          query.productVariantId ? eq(productVariantTable.id, query.productVariantId) : undefined,
          query.search
            ? or(ilike(productVariantTable.code, `%${query.search}%`), ilike(productTable.name, `%${query.search}%`))
            : undefined,
        );
        const [total] = await tx
          .select({ value: count() })
          .from(productVariantTable)
          .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
          .where(conditions);
        const pagination = calculatePagination(total.value, query.page, query.limit);
        if (pagination.totalItems === 0) return { pagination, variants: [] };
        // Retain deleted variants so their stock never disappears from inventory reports.
        const variants = await tx
          .select({
            productVariantId: productVariantTable.id,
            code: productVariantTable.code,
            name: productTable.name,
            deletedAt: productVariantTable.deletedAt,
            productDeletedAt: productTable.deletedAt,
          })
          .from(productVariantTable)
          .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
          .where(conditions)
          .orderBy(asc(productVariantTable.id))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit);
        const balances = await tx
          .select({ ...getTableColumns(inventoryBalanceTable), updatedByName: userTable.userName })
          .from(inventoryBalanceTable)
          .leftJoin(userTable, eq(userTable.id, inventoryBalanceTable.updatedBy))
          .where(
            inArray(
              inventoryBalanceTable.productVariantId,
              variants.map((variant) => variant.productVariantId),
            ),
          );
        const buckets = query.bucket ? [query.bucket] : INVENTORY_BUCKET;
        return {
          pagination,
          variants: variants.map((variant) => ({
            ...variant,
            balances: buckets.map((bucket) => {
              const balance = balances.find(
                (row) => row.productVariantId === variant.productVariantId && row.bucket === bucket,
              );
              return {
                bucket,
                quantity: balance?.quantity ?? 0,
                updatedAt: balance?.updatedAt ?? null,
                updatedBy: balance?.updatedBy ?? null,
                updatedByName: balance?.updatedByName ?? null,
              };
            }),
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

  getMovements = async (query: InventoryMovementsQuery) =>
    db.transaction(
      async (tx) => {
        const conditions = and(
          query.productVariantId ? eq(stockMovementTable.productVariantId, query.productVariantId) : undefined,
          query.bucket
            ? or(eq(stockMovementTable.fromBucket, query.bucket), eq(stockMovementTable.toBucket, query.bucket))
            : undefined,
          query.type ? eq(stockMovementTable.type, query.type) : undefined,
          query.orderId ? eq(stockMovementTable.orderId, query.orderId) : undefined,
          query.supplierOrderId ? eq(stockMovementTable.purchaseId, query.supplierOrderId) : undefined,
          query.createdBy ? eq(stockMovementTable.createdBy, query.createdBy) : undefined,
          query.start ? gte(stockMovementTable.createdAt, query.start) : undefined,
          query.end ? lte(stockMovementTable.createdAt, query.end) : undefined,
          query.search
            ? or(ilike(productVariantTable.code, `%${query.search}%`), ilike(productTable.name, `%${query.search}%`))
            : undefined,
        );
        const [total] = await tx
          .select({ value: count() })
          .from(stockMovementTable)
          .innerJoin(productVariantTable, eq(productVariantTable.id, stockMovementTable.productVariantId))
          .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
          .where(conditions);
        const pagination = calculatePagination(total.value, query.page, query.limit);
        if (pagination.totalItems === 0) return { pagination, movements: [] };
        const movements = await tx
          .select({
            ...getTableColumns(stockMovementTable),
            code: productVariantTable.code,
            name: productTable.name,
            createdByName: userTable.userName,
          })
          .from(stockMovementTable)
          .innerJoin(productVariantTable, eq(productVariantTable.id, stockMovementTable.productVariantId))
          .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
          .leftJoin(userTable, eq(userTable.id, stockMovementTable.createdBy))
          .where(conditions)
          .orderBy(desc(stockMovementTable.createdAt), desc(stockMovementTable.id))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit);
        return { pagination, movements };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
}
