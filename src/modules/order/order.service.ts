import { and, eq, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  clientTable,
  db,
  inventoryBalanceTable,
  orderProductTable,
  orderTable,
  salesChannelTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, DEFAULT_LIMIT, DEFAULT_PAGE, errorMessages, PAGINATION_LIMITS } from '@/shared/domain';
import { calculatePagination, isOneOf } from '@/shared/utils';
import { InventoryReturnService, InventorySaleService } from '../inventory';
import type { ProductService } from '../product';
import type { OrderProductDtoDetail } from './domain';
import { resumeOrdersQuery, searchOrdersQuery } from './queries/order.queries';
import type {
  ClientDto,
  GeneralUpdateOrderDto,
  OrderCompleteDto,
  OrderCreateDto,
  OrderProductDto,
  OrderQuerySchema,
  OrderUpdateDto,
} from './schemas/order.schema';
import type { OrderOutput, OrderProductOutput, RemainingQuantity } from './types/order';
import { calculateOrderTotals } from './utils';

export class OrderService {
  constructor(private readonly productService: ProductService) {}

  private prepareGeneralUpdatePayload = async (orderGeneralDto: Partial<GeneralUpdateOrderDto>, tx: Transaction) => {
    if (Object.keys(orderGeneralDto).length === 0) return;

    const orderUpdatePayload: Partial<GeneralUpdateOrderDto> = {};

    if (orderGeneralDto.salesChannelId) {
      const channelDb = await tx.query.salesChannelTable.findFirst({
        where: eq(salesChannelTable.id, orderGeneralDto.salesChannelId),
        columns: { id: true },
      });

      if (!channelDb) throw CustomError.notFound(errorMessages.salesChannel.notFound);
    }

    Object.assign(orderUpdatePayload, orderGeneralDto);

    return orderUpdatePayload;
  };

  private updateClientInfo = async (clientId: string, clientDto: Partial<ClientDto>, tx: Transaction) => {
    await tx
      .update(clientTable)
      .set({ ...clientDto })
      .where(eq(clientTable.id, clientId));
  };

  private getProductsDtoDetail = async (
    orderProductsDto: OrderProductDto[],
    remainingQuantitiesMap: Map<number, RemainingQuantity> | undefined,
    tx: Transaction,
  ): Promise<OrderProductDtoDetail[]> => {
    const details: OrderProductDtoDetail[] = [];
    // Consistent lock order coordinates concurrent sales with purchase posting.
    for (const productDto of [...orderProductsDto].sort((a, b) => a.variantId - b.variantId)) {
      const variant = await this.productService.getVariantByIdForUpdate(productDto.variantId, tx);
      if (!variant) throw CustomError.notFound(errorMessages.product.variantNotFoundById);
      const [balance] = await tx
        .select()
        .from(inventoryBalanceTable)
        .where(
          and(
            eq(inventoryBalanceTable.productVariantId, productDto.variantId),
            eq(inventoryBalanceTable.bucket, 'AVAILABLE'),
          ),
        );
      let price: string;
      let purchasePrice: string;
      if (productDto.type === 'RETURN') {
        const original = remainingQuantitiesMap?.get(productDto.variantId);
        if (!original) throw CustomError.conflict(errorMessages.order.missingProductOnOrderReference);
        price = original.priceProductToReturn;
        purchasePrice = original.purchasePriceProductToReturn;
      } else {
        price = productDto.price.toFixed(6);
        purchasePrice = variant.purchasePrice;
      }
      details.push({
        ...productDto,
        price,
        purchasePrice,
        currentStock: balance?.quantity ?? 0,
      });
    }
    return details;
  };

  private cancelSaleOrder = async (orderId: string, userId: string, tx: Transaction) => {
    await new InventorySaleService().releaseReservation(orderId, userId, tx);
    await tx.update(orderTable).set({ status: 'CANCELLED', updatedBy: userId }).where(eq(orderTable.id, orderId));
  };

  private reconcileOrderInventory = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    orderProductsDto: OrderProductDto[],
    userId: string,
    tx: Transaction,
  ) => {
    // Include removed variants before taking any new variant locks.
    const ids = [
      ...new Set([
        ...currentOrderProducts.map((product) => product.variantId),
        ...orderProductsDto.map((product) => product.variantId),
      ]),
    ].sort((a, b) => a - b);
    for (const id of ids) await this.productService.getVariantByIdForUpdate(id, tx);
    const details = await this.getProductsDtoDetail(orderProductsDto, undefined, tx);
    for (const detail of details) {
      const original = currentOrderProducts.find((product) => product.variantId === detail.variantId);
      if (original) detail.purchasePrice = original.purchasePrice;
    }
    await new InventorySaleService().setReservation(
      orderId,
      details.map((product) => ({
        productVariantId: product.variantId,
        quantity: product.quantity,
      })),
      userId,
      tx,
    );
    const keptIds = details.map((product) => product.variantId);
    await tx
      .delete(orderProductTable)
      .where(and(eq(orderProductTable.orderId, orderId), notInArray(orderProductTable.productVariantId, keptIds)));
    for (const product of details) {
      const original = currentOrderProducts.find((item) => item.variantId === product.variantId);
      const values = { price: product.price, purchasePrice: product.purchasePrice, quantity: product.quantity };
      if (original) {
        await tx.update(orderProductTable).set(values).where(eq(orderProductTable.id, original.id));
      } else {
        await tx
          .insert(orderProductTable)
          .values({ ...values, orderId, productVariantId: product.variantId, type: 'SALE' });
      }
    }
    return calculateOrderTotals(details);
  };

  private validateStockAndReturnFeasibility = (
    productsDetail: OrderProductDtoDetail[],
    remainingQuantitiesMap?: Map<number, RemainingQuantity>,
  ) => {
    productsDetail.forEach((p) => {
      if (p.type === 'SALE' && p.currentStock < p.quantity) {
        throw CustomError.conflict(errorMessages.order.outOfStock);
      }

      if (p.type === 'RETURN') {
        const remainingQuantity = remainingQuantitiesMap?.get(p.variantId);
        if (!remainingQuantity) {
          throw CustomError.conflict(errorMessages.order.missingProductOnOrderReference);
        }

        const remainQuantity = remainingQuantity.quantitySold - remainingQuantity.quantityReturned;

        if (remainQuantity < p.quantity) {
          throw CustomError.conflict(errorMessages.order.outOfProductToReturn);
        }
      }
    });
  };

  private getRemainingQuantitiesMapOrThrow = async (orderId: string, tx: Transaction) => {
    const remainingQuantities = await this.remainingOrderProductsQuantity(orderId, tx);

    if (remainingQuantities.length === 0) {
      throw CustomError.conflict(errorMessages.order.missingProductsOnOrderReference);
    }

    if (remainingQuantities.every((rq) => rq.quantitySold - rq.quantityReturned === 0)) {
      throw CustomError.conflict(errorMessages.order.outOfProductsToReturn);
    }

    return new Map(remainingQuantities.map((rq) => [rq.productVariantId, rq]));
  };

  private remainingOrderProductsQuantity = async (orderId: string, tx?: Transaction): Promise<RemainingQuantity[]> => {
    const executor = tx ?? db;

    const conditions = and(
      or(
        and(eq(orderTable.id, orderId), eq(orderProductTable.type, 'SALE')),
        and(eq(orderTable.relatedOrderId, orderId), eq(orderProductTable.type, 'RETURN')),
      ),
      ne(orderTable.status, 'CANCELLED'),
      ne(orderTable.status, 'PENDING'),
    );

    // Lock the original order to serialize returns; do not lock sibling return orders.
    await executor.select({ id: orderTable.id }).from(orderTable).where(eq(orderTable.id, orderId)).for('update');

    return await executor
      .select({
        productVariantId: orderProductTable.productVariantId,
        quantitySold: sql<number>`SUM(CASE WHEN ${orderProductTable.type} = 'SALE' THEN ${orderProductTable.quantity} ELSE 0 END)::int`,
        quantityReturned: sql<number>`SUM(CASE WHEN ${orderProductTable.type} = 'RETURN' THEN ${orderProductTable.quantity} ELSE 0 END)::int`,
        priceProductToReturn: sql<string>`MAX(CASE WHEN ${orderProductTable.type} = 'SALE' THEN ${orderProductTable.price} END)`,
        purchasePriceProductToReturn: sql<string>`MAX(CASE WHEN ${orderProductTable.type} = 'SALE' THEN ${orderProductTable.purchasePrice} END)`,
      })
      .from(orderTable)
      .innerJoin(orderProductTable, eq(orderTable.id, orderProductTable.orderId))
      .where(conditions)
      .groupBy(orderProductTable.productVariantId);
  };

  getAll = async (query: OrderQuerySchema) => {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = isOneOf(query.limit, PAGINATION_LIMITS) ? query.limit : DEFAULT_LIMIT;

    const totalResult = await db.execute(resumeOrdersQuery(query));
    const totalItems = (totalResult.rows[0] as { totalOrders: string }).totalOrders;

    const pagination = calculatePagination(parseInt(totalItems), page, limit);
    if (pagination.totalItems === 0) {
      return {
        pagination,
        orders: [],
      };
    }

    const { rows: orders } = await db.execute(
      searchOrdersQuery({
        ...query,
        limit: limit,
        offset: limit * (page - 1),
      }),
    );

    return {
      pagination,
      orders: orders,
    };
  };

  getById = async (id: string, tx?: Transaction, forUpdate = false) => {
    const executor = tx ?? db;

    if (forUpdate && tx) {
      await executor.select({ id: orderTable.id }).from(orderTable).where(eq(orderTable.id, id)).for('update');
    }

    const { rows: orders } = await executor.execute(searchOrdersQuery({ id }));
    if (orders.length === 0) throw CustomError.notFound(errorMessages.order.notFound);

    return orders[0] as unknown as OrderOutput;
  };

  create = async (orderDto: OrderCreateDto, userId: string) => {
    const { client: clientDto, products: productsDto, ...restDto } = orderDto;

    const newOrder = await db.transaction(async (tx) => {
      const salesChannelExists = await tx.query.salesChannelTable.findFirst({
        where: eq(salesChannelTable.id, restDto.salesChannelId),
      });
      if (!salesChannelExists) throw CustomError.notFound(errorMessages.salesChannel.notFound);

      // Validate the original completed order and the quantities still eligible for return.
      let relatedOrderDb: OrderOutput | undefined;
      let remainingQuantitiesMap: Map<number, RemainingQuantity> | undefined;
      const fullReturnOrderProductDtoDetail: OrderProductDtoDetail[] = [];

      if (restDto.relatedOrderId) {
        relatedOrderDb = await this.getById(restDto.relatedOrderId, tx, true);
        if (relatedOrderDb.status !== 'COMPLETED' || relatedOrderDb.type === 'RETURN') {
          throw CustomError.conflict(errorMessages.order.cannotReferenceNotCompletedSaleExchangeOrder);
        }

        const alreadyExistsPendingOrder = await tx
          .select({ id: orderTable.id })
          .from(orderTable)
          .where(and(eq(orderTable.relatedOrderId, restDto.relatedOrderId), eq(orderTable.status, 'PENDING')));

        if (alreadyExistsPendingOrder.length > 0) {
          throw CustomError.conflict(errorMessages.order.existsPendingOrder);
        }

        remainingQuantitiesMap = await this.getRemainingQuantitiesMapOrThrow(restDto.relatedOrderId, tx);

        // Build a full return from the original lines when the client omits products.
        if (restDto.type === 'RETURN' && restDto.fullReturn) {
          const remainingQuantitiesToReturn = [...remainingQuantitiesMap.values()].filter(
            (rq) => rq.quantitySold > rq.quantityReturned,
          );

          fullReturnOrderProductDtoDetail.push(
            ...remainingQuantitiesToReturn.map((rq) => {
              return {
                variantId: rq.productVariantId,
                type: 'RETURN' as const,
                quantity: rq.quantitySold - rq.quantityReturned,
                price: rq.priceProductToReturn,
                purchasePrice: rq.purchasePriceProductToReturn,
                currentStock: 0,
              };
            }),
          );
        }
      }

      // Resolve submitted lines or use the full-return lines built above.
      const productsDetail = productsDto
        ? await this.getProductsDtoDetail(productsDto, remainingQuantitiesMap, tx)
        : fullReturnOrderProductDtoDetail;

      // Validate stock and return eligibility for explicitly selected products.
      if (!restDto.fullReturn) {
        this.validateStockAndReturnFeasibility(productsDetail, remainingQuantitiesMap);
      }

      const totals = calculateOrderTotals(productsDetail, restDto.type);

      let clientId: string;
      if (restDto.type === 'SALE') {
        const [{ id: newClientId }] = await tx
          .insert(clientTable)
          .values({ ...clientDto })
          .returning({ id: clientTable.id });
        clientId = newClientId;
      } else {
        if (!relatedOrderDb) throw CustomError.conflict(errorMessages.order.missingRelatedOrder);
        clientId = relatedOrderDb.client.id;
      }

      const [{ id: newOrderId }] = await tx
        .insert(orderTable)
        .values({
          ...restDto,
          status: restDto.type === 'SALE' && restDto.status === 'COMPLETED' ? 'PAID' : restDto.status,
          ...totals,
          clientId: clientId,
          createdBy: userId,
        })
        .returning({
          id: orderTable.id,
        });

      const productsToInsert = productsDetail.map((p) => ({
        orderId: newOrderId,
        productVariantId: p.variantId,
        price: p.price,
        purchasePrice: p.purchasePrice,
        quantity: p.quantity,
        type: p.type,
      }));

      await tx.insert(orderProductTable).values(productsToInsert);
      if (restDto.type === 'SALE') {
        const inventory = new InventorySaleService();
        await inventory.setReservation(
          newOrderId,
          productsDetail.map((product) => ({
            productVariantId: product.variantId,
            quantity: product.quantity,
          })),
          userId,
          tx,
        );
        if (restDto.status === 'COMPLETED') {
          await inventory.deliverSale(newOrderId, userId, tx);
          await tx
            .update(orderTable)
            .set({ status: 'COMPLETED', updatedBy: userId })
            .where(eq(orderTable.id, newOrderId));
        }
      }

      return await this.getById(newOrderId, tx);
    });

    return newOrder;
  };

  update = async (orderId: string, orderDto: OrderUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      const { client: clientDto, products: productsDto, ...generalInfoOrderDto } = orderDto;

      if (orderDb.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCancelledOrder);
      }
      if (orderDb.status === 'COMPLETED') {
        throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCompletedOrder);
      }

      if (orderDb.type !== 'SALE') {
        if (productsDto) {
          throw CustomError.badRequest(errorMessages.order.cannotModifyProductsInNotSaleOrder);
        }

        if (generalInfoOrderDto.status) {
          throw CustomError.badRequest(errorMessages.order.cannotModifyStatusOnNotSaleOrder);
        }

        if (clientDto) {
          throw CustomError.badRequest(errorMessages.order.cannotModifyClientOnNotSaleOrder);
        }
      }

      const orderPayload = {};

      const generalPayload = await this.prepareGeneralUpdatePayload(generalInfoOrderDto, tx);
      if (generalPayload) Object.assign(orderPayload, generalPayload);

      if (productsDto && productsDto.length > 0) {
        const typeProductsDtoSet = new Set(productsDto.map((p) => p.type));

        if (!typeProductsDtoSet.has('SALE') || typeProductsDtoSet.size > 1) {
          throw CustomError.badRequest(errorMessages.order.invalidProductsTypeForSaleOrder);
        }

        const updateOrderTotals = await this.reconcileOrderInventory(
          orderId,
          orderDb.products,
          productsDto,
          userId,
          tx,
        );
        if (updateOrderTotals) Object.assign(orderPayload, updateOrderTotals);
      }

      if (clientDto) await this.updateClientInfo(orderDb.client.id, clientDto, tx);

      if (Object.keys(orderPayload).length > 0) {
        await tx
          .update(orderTable)
          .set({ ...orderPayload, updatedBy: userId })
          .where(eq(orderTable.id, orderId));
      }

      return await this.getById(orderId, tx);
    });
  };

  cancel = async (orderId: string, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      if (orderDb.status === 'COMPLETED') {
        throw CustomError.conflict(errorMessages.order.cannotCancelCompletedOrder);
      }

      if (orderDb.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.order.orderIsAlreadyCancel);
      }

      if (orderDb.type === 'SALE') {
        await this.cancelSaleOrder(orderId, userId, tx);
      } else {
        await tx.update(orderTable).set({ status: 'CANCELLED', updatedBy: userId }).where(eq(orderTable.id, orderId));
      }

      return await this.getById(orderId, tx);
    });
  };

  complete = async (orderId: string, userId: string, dto: OrderCompleteDto = {}) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      if (orderDb.status === 'COMPLETED') throw CustomError.conflict(errorMessages.order.orderIsAlreadyComplete);
      if (orderDb.status === 'CANCELLED') throw CustomError.conflict(errorMessages.order.cannotCompleteCancelledOrder);

      if (orderDb.type === 'SALE') {
        if (dto.items !== undefined) throw CustomError.badRequest(errorMessages.inventory.returnConditionsRequired);
        await new InventorySaleService().deliverSale(orderId, userId, tx);
      } else {
        if (!orderDb.relatedOrderId) throw CustomError.conflict(errorMessages.order.missingRelatedOrder);
        const remaining = await this.getRemainingQuantitiesMapOrThrow(orderDb.relatedOrderId, tx);
        for (const product of orderDb.products.filter((product) => product.type === 'RETURN')) {
          const original = remaining.get(product.variantId);
          if (!original || product.quantity > original.quantitySold - original.quantityReturned) {
            throw CustomError.conflict(errorMessages.order.outOfProductToReturn);
          }
        }
        await new InventoryReturnService().complete(orderId, dto.items ?? [], userId, tx);
      }
      await tx.update(orderTable).set({ status: 'COMPLETED', updatedBy: userId }).where(eq(orderTable.id, orderId));
      return await this.getById(orderId, tx);
    });
  };

  softDelete = async (orderId: string, userId: string): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      if (orderDb.status !== 'CANCELLED')
        throw CustomError.conflict(errorMessages.inventory.cancelledOrderRequiredForDeletion);
      await tx.update(orderTable).set({ deletedAt: new Date(), updatedBy: userId }).where(eq(orderTable.id, orderId));

      return true;
    });
  };
}
