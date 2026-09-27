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
import type {
  GetSupplierOrdersQuery,
  SupplierOrderCreateDto,
  SupplierOrderUpdateDto,
} from './schemas/supplier-order.schema';

export class SupplierOrderService {
  private getOrderForUpdate = async (id: string, tx: Transaction) => {
    const [order] = await tx.select().from(supplierOrderTable).where(eq(supplierOrderTable.id, id)).for('update');
    if (!order) throw CustomError.notFound(errorMessages.supplierOrder.notFound);
    return order;
  };

  private validateSupplier = async (supplierId: string, tx: Transaction) => {
    const [supplier] = await tx
      .select({ id: supplierTable.id, isActive: supplierTable.isActive })
      .from(supplierTable)
      .where(eq(supplierTable.id, supplierId))
      .for('share');
    if (!supplier) throw CustomError.notFound(errorMessages.supplier.notFound);
    if (!supplier.isActive) throw CustomError.conflict(errorMessages.supplierOrder.inactiveSupplier);
  };

  private validateVariants = async (ids: number[], tx: Transaction) => {
    const variantIds = [...new Set(ids)];
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
    if (variants.length !== variantIds.length)
      throw CustomError.notFound(errorMessages.supplierOrder.variantUnavailable);
  };

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
      await this.validateSupplier(dto.supplierId, tx);
      await this.validateVariants(
        dto.products.map((product) => product.productVariantId),
        tx,
      );

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

  update = async (id: string, dto: SupplierOrderUpdateDto, userId: string) => {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw CustomError.badRequest(errorMessages.common.bodyEmpty);
    }
    return db.transaction(async (tx) => {
      const order = await this.getOrderForUpdate(id, tx);
      if (order.status !== 'PREPARING' && order.status !== 'IN_TRANSIT') {
        throw CustomError.conflict(errorMessages.supplierOrder.notEditable);
      }
      const { products, ...header } = dto;
      if (header.supplierId !== undefined && header.supplierId !== order.supplierId) {
        await this.validateSupplier(header.supplierId, tx);
      }
      // Changing currency must not silently relabel the previous monetary values.
      if (
        header.currency !== undefined &&
        header.currency !== order.currency &&
        (products === undefined || header.supplierPaymentAmount === undefined)
      ) {
        throw CustomError.badRequest(errorMessages.supplierOrder.currencyChangeRequiresAmounts);
      }

      if (products !== undefined) {
        if (products.length === 0) throw CustomError.badRequest(errorMessages.supplierOrder.productsRequired);
        const hasPurchase = products.some((product) => product.type === 'PURCHASE');
        if (order.type === 'PURCHASE' && !hasPurchase) {
          throw CustomError.badRequest(errorMessages.supplierOrder.purchaseProductRequired);
        }
        if (order.type === 'COMPENSATION' && hasPurchase) {
          throw CustomError.badRequest(errorMessages.supplierOrder.compensationProductsOnly);
        }
        const existing = await tx
          .select({ id: supplierOrderProductTable.id })
          .from(supplierOrderProductTable)
          .where(eq(supplierOrderProductTable.supplierOrderId, id));
        const existingIds = new Set(existing.map((product) => product.id));
        const retainedIds = products.flatMap((product) => (product.id ? [product.id] : []));
        if (new Set(retainedIds).size !== retainedIds.length) {
          throw CustomError.badRequest(errorMessages.supplierOrder.duplicatedLineIds);
        }
        if (retainedIds.some((productId) => !existingIds.has(productId))) {
          throw CustomError.badRequest(errorMessages.supplierOrder.productNotInOrder);
        }
        await this.validateVariants(
          products.map((product) => product.productVariantId),
          tx,
        );

        const removedIds = existing.filter((product) => !retainedIds.includes(product.id)).map((product) => product.id);
        if (removedIds.length > 0) {
          await tx.delete(supplierOrderProductTable).where(inArray(supplierOrderProductTable.id, removedIds));
        }
        for (const { id: productId, ...product } of products) {
          if (productId) {
            await tx
              .update(supplierOrderProductTable)
              .set({ ...product, updatedBy: userId })
              .where(
                and(eq(supplierOrderProductTable.id, productId), eq(supplierOrderProductTable.supplierOrderId, id)),
              );
          } else {
            await tx.insert(supplierOrderProductTable).values({ ...product, supplierOrderId: id, createdBy: userId });
          }
        }
      }
      await tx
        .update(supplierOrderTable)
        .set({ ...header, updatedBy: userId })
        .where(eq(supplierOrderTable.id, id));
      return this.getById(id, tx);
    });
  };

  private transitionFromPreparing = async (id: string, status: 'IN_TRANSIT' | 'CANCELLED', userId: string) => {
    return db.transaction(async (tx) => {
      const order = await this.getOrderForUpdate(id, tx);
      if (order.status !== 'PREPARING') {
        throw CustomError.conflict(
          status === 'CANCELLED'
            ? errorMessages.supplierOrder.cannotCancel
            : errorMessages.supplierOrder.cannotMarkInTransit,
        );
      }
      await tx.update(supplierOrderTable).set({ status, updatedBy: userId }).where(eq(supplierOrderTable.id, id));
      return this.getById(id, tx);
    });
  };

  markInTransit = async (id: string, userId: string) => this.transitionFromPreparing(id, 'IN_TRANSIT', userId);

  cancel = async (id: string, userId: string) => this.transitionFromPreparing(id, 'CANCELLED', userId);
}
