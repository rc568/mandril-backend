import { eq } from 'drizzle-orm';
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
  GeneralOrderDto,
  OrderCreateDto,
  OrderProductDto,
  OrderQuerySchema,
  OrderUpdateDto,
} from './schemas/order.schema';
import type { OrderOutput, OrderProductOutput } from './types/order';
import { calculateOrderTotals, mapProductsForOperation } from './utils';

export class OrderService {
  constructor(private readonly productService: ProductService) {}

  private prepareGeneralUpdatePayload = async (orderGeneralDto: Partial<GeneralOrderDto>, tx: Transaction) => {
    if (Object.keys(orderGeneralDto).length === 0) return;

    const orderUpdatePayload: Partial<GeneralOrderDto> = {};

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
    await tx.update(clientTable).set(clientDto).where(eq(clientTable.id, clientId));
  };

  private getProductsDtoDetail = async (
    orderProductsDto: OrderProductDto[],
    tx: Transaction,
  ): Promise<OrderProductDtoDetail[]> => {
    return await Promise.all(
      orderProductsDto.map(async (p) => {
        const variantDb = await this.productService.getVariantByIdForUpdate(p.variantId, tx);
        if (!variantDb) throw CustomError.notFound(errorMessages.product.variantNotFoundById);

        return {
          ...p,
          price: p.price.toFixed(6),
          currentStock: variantDb.quantityInStock,
          purchasePrice: variantDb.purchasePrice,
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

  private cancelExistingOrder = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    userId: string,
    tx: Transaction,
  ) => {
    const updateOrderProducts = tx
      .update(orderProductTable)
      .set({ type: 'RETURN' })
      .where(eq(orderProductTable.orderId, orderId));

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

    await Promise.all([updateOrderProducts, ...returnStockAndStockMovementsPromises]);

    return {
      numProducts: 0,
      totalSale: '0',
      totalCost: '0',
    };
  };

  private reconcileOrderInventory = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    orderProductsDto: OrderProductDto[],
    userId: string,
    tx: Transaction,
  ) => {
    const productsDtoDetail = await this.getProductsDtoDetail(orderProductsDto, tx);
    console.log('order-product-output', currentOrderProducts);

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

    return {
      numProducts: totals.numProducts,
      totalSale: totals.totalSale,
      totalCost: totals.totalCost,
    };
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

  getById = async (id: string, tx?: Transaction) => {
    const executor = tx ?? db;

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

      if (restDto.relatedOrderId) {
        await this.getById(restDto.relatedOrderId, tx);
      }

      const productsDetail = await this.getProductsDtoDetail(productsDto, tx);

      productsDetail.forEach((p) => {
        if (p.type !== 'RETURN' && p.currentStock < p.quantity) {
          throw CustomError.conflict(errorMessages.order.outOfStock);
        }
      });

      const totals = calculateOrderTotals(productsDetail);

      const [{ id: newClientId }] = await tx.insert(clientTable).values(clientDto).returning({ id: clientTable.id });
      const [{ id: newOrderId }] = await tx
        .insert(orderTable)
        .values({
          ...restDto,
          clientId: newClientId,
          createdBy: userId,
          totalSale: totals.totalSale,
          totalCost: totals.totalCost,
          numProducts: totals.numProducts,
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

      const stockUpdatePromises = productsDetail.map((p) => {
        const stockToAdd = p.type === 'RETURN' ? p.quantity : -p.quantity;
        return this.productService.addStockForOrder({ variantId: p.variantId, stockToAdd: stockToAdd }, userId, tx);
      });

      const stockMovementsToInsert = productsDetail.map((p) => ({
        productVariantId: p.variantId,
        type: p.type,
        quantity: p.quantity,
        createdBy: userId,
        orderId: newOrderId,
      }));

      await Promise.all([
        tx.insert(orderProductTable).values(productsToInsert),
        ...stockUpdatePromises,
        tx.insert(stockMovementTable).values(stockMovementsToInsert),
      ]);

      return await this.getById(newOrderId, tx);
    });

    return newOrder;
  };

  update = async (orderId: string, orderDto: OrderUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      const { client: clientDto, products: productsDto, ...generalInfoOrderDto } = orderDto;

      if (orderDb.status === 'CANCELLED') {
        throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCancelledOrder);
      }
      if (orderDb.status === 'COMPLETED') {
        throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCompletedOrder);
      }
      if (
        orderDb.invoiceType !== 'SIN COMPROBANTE' &&
        generalInfoOrderDto.invoiceType &&
        generalInfoOrderDto.invoiceType !== 'SIN COMPROBANTE'
      ) {
        throw CustomError.conflict(errorMessages.order.cannotModifyExistingInvoice);
      }

      const orderPayload = {};

      const generalPayload = await this.prepareGeneralUpdatePayload(generalInfoOrderDto, tx);
      if (generalPayload) Object.assign(orderPayload, generalPayload);

      const willBeCancelled = generalInfoOrderDto.status === 'CANCELLED';
      if (willBeCancelled) {
        const totalOrderPayload = await this.cancelExistingOrder(orderId, orderDb.products, userId, tx);
        Object.assign(orderPayload, totalOrderPayload);
      } else {
        if (productsDto && productsDto.length > 0) {
          if (orderDb.type !== 'SALE') {
            throw CustomError.badRequest(errorMessages.order.cannotModifyProductsInNotSaleOrder);
          }

          const typeProductsDtoSet = new Set(productsDto.map((p) => p.type));

          if (!typeProductsDtoSet.has('SALE') || typeProductsDtoSet.size > 1) {
            throw CustomError.badRequest(errorMessages.order.invalidProductsTypeForSaleOrder);
          }

          const productsPayload = await this.reconcileOrderInventory(
            orderId,
            orderDb.products,
            productsDto,
            userId,
            tx,
          );
          if (productsPayload) Object.assign(orderPayload, productsPayload);
        }
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

  softDelete = async (orderId: string, userId: string): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      await tx.update(orderTable).set({ deletedAt: new Date(), updatedBy: userId }).where(eq(orderTable.id, orderId));

      return true;
    });
  };
}
