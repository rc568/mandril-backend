import { and, asc, count, desc, eq, getTableColumns, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  db,
  productTable,
  productVariantTable,
  supplierOrderProductTable,
  supplierOrderTable,
  supplierTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, DEFAULT_LIMIT, DEFAULT_PAGE, errorMessages, PAGINATION_LIMITS } from '@/shared/domain';
import { calculatePagination, isOneOf } from '@/shared/utils';
import type { GetSupplierOrdersQuery, SupplierOrderCreateDto } from './schemas/supplier-order.schema';

export class SupplierOrderService {
  getAll = async (query: GetSupplierOrdersQuery) => {
    const requestedPage = query.page ?? DEFAULT_PAGE;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : DEFAULT_PAGE;
    const limit = isOneOf(query.limit, PAGINATION_LIMITS) ? query.limit : DEFAULT_LIMIT;
    const search = query.search?.trim().replace(/[\\%_]/g, '\\$&');
    const conditions = and(
      query.supplierId ? eq(supplierOrderTable.supplierId, query.supplierId) : undefined,
      query.type ? eq(supplierOrderTable.type, query.type) : undefined,
      query.status ? eq(supplierOrderTable.status, query.status) : undefined,
      query.reviewStatus ? eq(supplierOrderTable.reviewStatus, query.reviewStatus) : undefined,
      query.currency ? eq(supplierOrderTable.currency, query.currency) : undefined,
      search
        ? or(
            ilike(supplierTable.name, `%${search}%`),
            ilike(supplierOrderTable.trackingNumber, `%${search}%`),
            ilike(supplierOrderTable.importPolicy, `%${search}%`),
            ilike(supplierOrderTable.observation, `%${search}%`),
          )
        : undefined,
    );
    const [total] = await db
      .select({ count: count() })
      .from(supplierOrderTable)
      .innerJoin(supplierTable, eq(supplierOrderTable.supplierId, supplierTable.id))
      .where(conditions);
    const pagination = calculatePagination(total.count, page, limit);
    if (pagination.totalItems === 0) return { pagination, orders: [] };

    const orders = await db
      .select({
        ...getTableColumns(supplierOrderTable),
        supplier: { id: supplierTable.id, name: supplierTable.name, isActive: supplierTable.isActive },
      })
      .from(supplierOrderTable)
      .innerJoin(supplierTable, eq(supplierOrderTable.supplierId, supplierTable.id))
      .where(conditions)
      .orderBy(desc(supplierOrderTable.createdAt), desc(supplierOrderTable.id))
      .limit(limit)
      .offset((page - 1) * limit);
    return { pagination, orders };
  };

  getById = async (id: string, tx?: Transaction) => {
    const executor = tx ?? db;
    const order = await executor.query.supplierOrderTable.findFirst({
      where: eq(supplierOrderTable.id, id),
      with: {
        supplier: { columns: { id: true, name: true, isActive: true } },
        products: {
          // Preserve decimals as text inside the relational query's JSON result.
          columns: { unitPrice: false, subtotalPrice: false, calculatedUnitCost: false, calculatedUnitCostPen: false },
          extras: (products) => ({
            unitPrice: sql<string | null>`${products.unitPrice}::text`.as('unit_price'),
            subtotalPrice: sql<string | null>`${products.subtotalPrice}::text`.as('subtotal_price'),
            calculatedUnitCost: sql<string | null>`${products.calculatedUnitCost}::text`.as('calculated_unit_cost'),
            calculatedUnitCostPen: sql<string | null>`${products.calculatedUnitCostPen}::text`.as(
              'calculated_unit_cost_pen',
            ),
          }),
          orderBy: (products, { asc }) => [asc(products.id)],
          with: {
            productVariant: {
              columns: { id: true, code: true, isActive: true, deletedAt: true },
              with: { productParent: { columns: { id: true, name: true } } },
            },
          },
        },
        expenses: {
          columns: { amountUsd: false, amountPen: false },
          extras: (expenses) => ({
            amountUsd: sql<string | null>`${expenses.amountUsd}::text`.as('amount_usd'),
            amountPen: sql<string | null>`${expenses.amountPen}::text`.as('amount_pen'),
          }),
          orderBy: (expenses, { asc }) => [asc(expenses.createdAt), asc(expenses.id)],
        },
      },
    });
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return order;
  };

  create = async (dto: SupplierOrderCreateDto, userId: string) => {
    return db.transaction(async (tx) => {
      // Keep reference data stable until the purchase is committed.
      const [supplier] = await tx
        .select({ id: supplierTable.id, isActive: supplierTable.isActive })
        .from(supplierTable)
        .where(eq(supplierTable.id, dto.supplierId))
        .for('share');
      if (!supplier) throw CustomError.notFound(errorMessages.supplier.notFound);
      if (!supplier.isActive) throw CustomError.conflict(errorMessages.supplierOrder.inactiveSupplier);

      const variantIds = [...new Set(dto.products.map((product) => product.productVariantId))];
      const variants = await tx
        .select({ id: productVariantTable.id })
        .from(productVariantTable)
        .innerJoin(productTable, eq(productVariantTable.productId, productTable.id))
        .where(
          and(
            inArray(productVariantTable.id, variantIds),
            isNull(productVariantTable.deletedAt),
            isNull(productTable.deletedAt),
          ),
        )
        .orderBy(asc(productVariantTable.id))
        .for('share');
      if (variants.length !== variantIds.length) {
        throw CustomError.notFound(errorMessages.supplierOrder.variantUnavailable);
      }

      const { products, ...header } = dto;
      const [order] = await tx
        .insert(supplierOrderTable)
        .values({ ...header, createdBy: userId })
        .returning({ id: supplierOrderTable.id });
      await tx.insert(supplierOrderProductTable).values(
        products.map((product) => ({
          ...product,
          supplierOrderId: order.id,
          createdBy: userId,
        })),
      );
      // Costs and stock are resolved later, when the purchase is received and reviewed.
      return this.getById(order.id, tx);
    });
  };
}
