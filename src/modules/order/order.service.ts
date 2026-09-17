import { and, eq, ne, or, sql } from 'drizzle-orm';
import {
  clientTable,
  db,
  orderProductTable,
  orderTable,
  salesChannelTable,
  stockMovementTable,
  type Transaction,
} from '@/shared/db';
import { CustomError, DEFAULT_LIMIT, DEFAULT_PAGE, errorMessages, PAGINATION_LIMITS } from '@/shared/domain';
import { calculatePagination, isOneOf } from '@/shared/utils';
import type { ProductService } from '../product';
import type { OrderProductDtoDetail, OrderProductDtoOperation } from './domain';
import { resumeOrdersQuery, searchOrdersQuery } from './queries/order.queries';
import type {
  ClientDto,
  GeneralUpdateOrderDto,
  OrderCreateDto,
  OrderProductDto,
  OrderQuerySchema,
  OrderUpdateDto,
} from './schemas/order.schema';
import type { OrderOutput, OrderProductOutput, RemainingQuantity } from './types/order';
import { calculateOrderTotals, mapProductsForOperation } from './utils';

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
    if (orderProductsDto.length === 0) return [];

    return await Promise.all(
      orderProductsDto.map(async (productDto) => {
        const variantDb = await this.productService.getVariantByIdForUpdate(productDto.variantId, tx);
        if (!variantDb) throw CustomError.notFound(errorMessages.product.variantNotFoundById);

        let price: string;
        let purchasePrice: string;
        if (productDto.type === 'RETURN') {
          const relatedProductDb = remainingQuantitiesMap?.get(productDto.variantId);
          if (!relatedProductDb) {
            throw CustomError.conflict(errorMessages.order.missingProductOnOrderReference);
          }

          price = relatedProductDb.priceProductToReturn;
          purchasePrice = relatedProductDb.purchasePriceProductToReturn;
        } else {
          price = productDto.price.toFixed(6);
          purchasePrice = variantDb.purchasePrice;
        }

        return {
          ...productDto,
          price: price,
          currentStock: variantDb.quantityInStock,
          purchasePrice: purchasePrice,
        };
      }),
    );
  };

  private validateInventoryUpdateFeasibility = (productsOperations: OrderProductDtoOperation[]) => {
    for (const po of productsOperations) {
      if (po.type === 'SALE') {
        if (po.currentStock + po.stockToAdd < 0) throw CustomError.conflict(errorMessages.order.outOfStock);
      }
    }
  };

  private cancelSaleOrder = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    userId: string,
    tx: Transaction,
  ) => {
    const returnStockAndStockMovementsPromises = currentOrderProducts.flatMap((op) => {
      return [
        this.productService.addStockForOrder({ variantId: op.variantId, stockToAdd: op.quantity }, userId, tx),
        tx.insert(stockMovementTable).values({
          productVariantId: op.variantId,
          type: 'RETURN',
          quantity: op.quantity,
          orderId: orderId,
          createdBy: userId,
        }),
      ];
    });

    await Promise.all([
      ...returnStockAndStockMovementsPromises,
      tx.update(orderTable).set({ status: 'CANCELLED', updatedBy: userId }).where(eq(orderTable.id, orderId)),
    ]);
  };

  private reconcileOrderInventory = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    orderProductsDto: OrderProductDto[],
    userId: string,
    tx: Transaction,
  ) => {
    const productsDtoDetail = await this.getProductsDtoDetail(orderProductsDto, undefined, tx);
    const productsOrderOperations = mapProductsForOperation(productsDtoDetail, currentOrderProducts);

    this.validateInventoryUpdateFeasibility(productsOrderOperations);

    await tx.delete(orderProductTable).where(eq(orderProductTable.orderId, orderId));
    await tx.delete(stockMovementTable).where(eq(stockMovementTable.orderId, orderId));

    const productsToAdd = productsOrderOperations.filter((p) => p.type === 'SALE');
    const totals = calculateOrderTotals(productsToAdd);

    const productsToInsert = productsToAdd.map((p) => {
      return {
        orderId: orderId,
        productVariantId: p.variantId,
        price: p.price,
        purchasePrice: p.purchasePrice,
        quantity: p.quantity,
        type: p.type,
      };
    });
    const stockUpdatePromises = productsOrderOperations.map((p) => {
      return this.productService.addStockForOrder({ variantId: p.variantId, stockToAdd: p.stockToAdd }, userId, tx);
    });
    const stockMovementsToInsert = productsToAdd.map((p) => ({
      productVariantId: p.variantId,
      type: p.type,
      quantity: p.quantity,
      createdBy: userId,
      orderId: orderId,
    }));

    await Promise.all([
      tx.insert(orderProductTable).values(productsToInsert),
      ...stockUpdatePromises,
      tx.insert(stockMovementTable).values(stockMovementsToInsert),
    ]);

    return totals;
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

  private buildStockMutation = (
    productsDetail: OrderProductDtoDetail[],
    orderId: string,
    userId: string,
    tx: Transaction,
  ) => {
    const stockUpdatesMap = new Map<number, number>();
    const stockMovementsToInsert = [];
    const stockUpdatePromises = [];

    for (const product of productsDetail) {
      const stockChange = product.type === 'RETURN' ? product.quantity : -product.quantity;
      stockUpdatesMap.set(product.variantId, (stockUpdatesMap.get(product.variantId) ?? 0) + stockChange);

      stockMovementsToInsert.push({
        productVariantId: product.variantId,
        type: product.type,
        quantity: product.quantity,
        createdBy: userId,
        orderId,
      });
    }

    for (const [variantId, stockToAdd] of stockUpdatesMap) {
      stockUpdatePromises.push(this.productService.addStockForOrder({ variantId, stockToAdd }, userId, tx));
    }

    return [...stockUpdatePromises, tx.insert(stockMovementTable).values(stockMovementsToInsert)];
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

    await executor
      .select({ id: orderTable.id })
      .from(orderTable)
      .innerJoin(orderProductTable, eq(orderTable.id, orderProductTable.orderId))
      .where(conditions)
      .for('update');

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

      // Obtenemos remainingQuantities (caso de una orden RETURN/EXCHANGE) y validamos existencia de relatedOrderId así como validaciones de negocio
      let relatedOrderDb: OrderOutput | undefined;
      let remainingQuantitiesMap: Map<number, RemainingQuantity> | undefined;
      const fullReturnOrderProductDtoDetail: OrderProductDtoDetail[] = [];

      if (restDto.relatedOrderId) {
        relatedOrderDb = await this.getById(restDto.relatedOrderId, tx);
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

        // Construimos "productsDetail" en caso de un FullReturn usando la orden de venta base dado la ausencia de productsDto
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

      // Definimos productsDetail en base a la presencia de productsDto (fullReturn vs otro tipo de orden)
      const productsDetail = productsDto
        ? await this.getProductsDtoDetail(productsDto, remainingQuantitiesMap, tx)
        : fullReturnOrderProductDtoDetail;

      // Validaciones de stock y existencia de los productos (no aplica en FullReturn)
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

      const mutations: Promise<unknown>[] = [tx.insert(orderProductTable).values(productsToInsert)];

      if (restDto.type === 'SALE') {
        const stockPromises = this.buildStockMutation(productsDetail, newOrderId, userId, tx);
        mutations.push(...stockPromises);
      }

      await Promise.all([...mutations]);

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
        await this.cancelSaleOrder(orderId, orderDb.products, userId, tx);
      } else {
        await tx.update(orderTable).set({ status: 'CANCELLED', updatedBy: userId }).where(eq(orderTable.id, orderId));
      }

      return await this.getById(orderId, tx);
    });
  };

  complete = async (orderId: string, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      if (orderDb.status === 'COMPLETED') throw CustomError.conflict(errorMessages.order.orderIsAlreadyComplete);
      if (orderDb.status === 'CANCELLED') throw CustomError.conflict(errorMessages.order.cannotCompleteCancelledOrder);

      if (orderDb.type === 'SALE') {
        await tx.update(orderTable).set({ status: 'COMPLETED', updatedBy: userId }).where(eq(orderTable.id, orderId));
      } else {
        const { relatedOrderId, products: productsDb } = orderDb;
        if (!relatedOrderId) throw CustomError.conflict(errorMessages.order.missingRelatedOrder);

        const remainingQuantitiesMap = await this.getRemainingQuantitiesMapOrThrow(relatedOrderId, tx);

        const productsMapDto = productsDb.map((p) => ({
          variantId: p.variantId,
          type: p.type,
          price: parseFloat(p.price),
          quantity: p.quantity,
        }));
        const productsDetail = await this.getProductsDtoDetail(productsMapDto, remainingQuantitiesMap, tx);

        this.validateStockAndReturnFeasibility(productsDetail, remainingQuantitiesMap);

        const stockPromises = this.buildStockMutation(productsDetail, orderId, userId, tx);

        await Promise.all([
          ...stockPromises,
          tx.update(orderTable).set({ status: 'COMPLETED', updatedBy: userId }).where(eq(orderTable.id, orderId)),
        ]);
      }
      return await this.getById(orderId, tx);
    });
  };

  softDelete = async (orderId: string, userId: string): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx, true);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      await tx.update(orderTable).set({ deletedAt: new Date(), updatedBy: userId }).where(eq(orderTable.id, orderId));

      return true;
    });
  };
}
