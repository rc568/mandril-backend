import { eq } from 'drizzle-orm';
import { clientTable, db, orderProductTable, orderTable, salesChannelTable, type Transaction } from '@/shared/db';
import { CustomError, DEFAULT_LIMIT, DEFAULT_PAGE, errorMessages, PAGINATION_LIMITS } from '@/shared/domain';
import { calculatePagination } from '@/shared/utils';
import type { ProductService } from '../product';
import type { OrderOptions, OrderProductDetail, OrderProductOperation, OrderStatus } from './domain';
import { resumeOrdersQuery, searchOrdersQuery } from './queries/order.queries';
import type {
  ClientDto,
  GeneralOrderDto,
  OrderCreateDto,
  OrderProductDto,
  OrderUpdateDto,
} from './schemas/order.schema';
import type { OrderOutput, OrderProductOutput } from './types/order';
import { calculateOrderTotals, mapProductsForOperation } from './utils';

export class OrderService {
  constructor(private readonly productService: ProductService) {}

  private prepareGeneralUpdatePayload = async (
    currentStatus: OrderStatus,
    orderGeneralDto: Partial<GeneralOrderDto>,
    noInvoice: boolean,
    tx: Transaction,
  ) => {
    if (Object.keys(orderGeneralDto).length === 0) return;

    const orderUpdatePayload: Partial<GeneralOrderDto> = {};

    if (orderGeneralDto.salesChannelId) {
      const channelDb = await tx.query.salesChannelTable.findFirst({
        where: eq(salesChannelTable.id, orderGeneralDto.salesChannelId),
        columns: { id: true },
      });

      if (!channelDb) throw CustomError.notFound(errorMessages.salesChannel.notFound);
    }

    if (
      currentStatus === 'CANCELLED' &&
      orderGeneralDto.status !== 'CANCELLED' &&
      orderGeneralDto.status !== undefined
    ) {
      throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCancelledOrder);
    }

    Object.assign(orderUpdatePayload, orderGeneralDto);

    if (noInvoice) {
      Object.assign(orderUpdatePayload, { invoiceCode: null });
    }

    return orderUpdatePayload;
  };

  private updateClientInfo = async (
    clientId: string,
    clientDto: Partial<ClientDto>,
    isRemovingInvoice: boolean,
    tx: Transaction,
  ) => {
    if (isRemovingInvoice) {
      await tx
        .update(clientTable)
        .set({ ...clientDto, bussinessName: null, documentNumber: null, documentType: 'SIN DOCUMENTO' })
        .where(eq(clientTable.id, clientId));

      return;
    }
    await tx.update(clientTable).set(clientDto).where(eq(clientTable.id, clientId));
  };

  private getProductsDetail = async (
    orderProductsDto: OrderProductDto[],
    tx: Transaction,
  ): Promise<OrderProductDetail[]> => {
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

  private validateInventoryUpdateFeasibility = (productsOperations: OrderProductOperation[]) => {
    for (const po of productsOperations) {
      if (po.deletedProduct === false) {
        if (po.currentStock + po.stockToAdd < 0) throw CustomError.conflict(errorMessages.order.outOfStock);
      }
    }
  };

  private reconcileOrderInventory = async (
    orderId: string,
    currentOrderProducts: OrderProductOutput[],
    orderProductsDto: OrderProductDto[],
    isCancelling: boolean,
    userId: string,
    tx: Transaction,
  ) => {
    if (isCancelling) {
      const returnStockPromises = currentOrderProducts.map((op) => {
        return this.productService.addStockForOrder({ variantId: op.variantId, stockToAdd: op.quantity }, userId, tx);
      });
      await Promise.all(returnStockPromises);

      return {
        numProducts: 0,
        totalSale: '0',
        totalCost: '0',
      };
    }

    const productsDetail = await this.getProductsDetail(orderProductsDto, tx);
    const productsOperations = mapProductsForOperation(productsDetail, currentOrderProducts);

    this.validateInventoryUpdateFeasibility(productsOperations);

    await tx.delete(orderProductTable).where(eq(orderProductTable.orderId, orderId));

    const productsToAdd = productsOperations.filter((p) => !p.deletedProduct);
    const totals = calculateOrderTotals(productsToAdd);

    const productsToInsert = productsToAdd.map((p) => {
      return {
        ...p,
        orderId: orderId,
        productVariantId: p.variantId,
      };
    });
    const stockUpdatePromises = productsOperations.map((p) => {
      return this.productService.addStockForOrder({ variantId: p.variantId, stockToAdd: p.stockToAdd }, userId, tx);
    });

    await Promise.all([tx.insert(orderProductTable).values(productsToInsert), ...stockUpdatePromises]);

    return {
      numProducts: totals.numProducts,
      totalSale: totals.totalSale,
      totalCost: totals.totalCost,
    };
  };

  getAll = async ({
    maxDate,
    minDate,
    channel,
    invoiceType,
    status,
    limit = DEFAULT_LIMIT,
    page = DEFAULT_PAGE,
    sortBy,
    search,
  }: OrderOptions) => {
    if (!PAGINATION_LIMITS.includes(limit as any)) limit = DEFAULT_LIMIT;

    const totalResult = await db.execute(
      resumeOrdersQuery({ channel, invoiceType, maxDate, minDate, search, sortBy, status }),
    );
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
        channel,
        invoiceType,
        limit,
        maxDate,
        minDate,
        offset: limit * (page - 1),
        search,
        sortBy,
        status,
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
    const { client, products: productsDto, ...rest } = orderDto;

    const newOrder = await db.transaction(async (tx) => {
      const salesChannelExists = await tx.query.salesChannelTable.findFirst({
        where: eq(salesChannelTable.id, rest.salesChannelId),
      });
      if (!salesChannelExists) throw CustomError.notFound(errorMessages.salesChannel.notFound);

      const productsDetail = await this.getProductsDetail(productsDto, tx);

      productsDetail.forEach((p) => {
        if (p.currentStock < p.quantity) throw CustomError.conflict(errorMessages.order.outOfStock);
      });

      const totals = calculateOrderTotals(productsDetail);

      const [{ id: newClientId }] = await tx.insert(clientTable).values(client).returning({ id: clientTable.id });
      const [{ id: newOrderId }] = await tx
        .insert(orderTable)
        .values({
          ...rest,
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
      }));
      const stockUpdatePromises = productsDetail.map((op) =>
        this.productService.addStockForOrder({ variantId: op.variantId, stockToAdd: -op.quantity }, userId, tx),
      );

      await Promise.all([tx.insert(orderProductTable).values(productsToInsert), ...stockUpdatePromises]);

      return await this.getById(newOrderId, tx);
    });

    return newOrder;
  };

  update = async (orderId: string, orderDto: OrderUpdateDto, userId: string) => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      const { client: clientDto, products: productsDto, ...generalOrderInfo } = orderDto;

      const cannotBeCancelled =
        orderDb.status === 'CANCELLED' &&
        generalOrderInfo.status !== undefined &&
        generalOrderInfo.status !== 'CANCELLED';
      const willBeCancelled = orderDb.status !== 'CANCELLED' && generalOrderInfo.status === 'CANCELLED';
      const willBeWithoutInvoice =
        orderDb.status !== 'SIN COMPROBANTE' && generalOrderInfo.invoiceType === 'SIN COMPROBANTE';

      if (cannotBeCancelled) {
        throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCancelledOrder);
      }

      const orderPayload = {};

      const generalPayload = await this.prepareGeneralUpdatePayload(
        orderDb.status,
        generalOrderInfo,
        willBeWithoutInvoice,
        tx,
      );
      if (generalPayload) Object.assign(orderPayload, generalPayload);

      if (productsDto && productsDto.length > 0) {
        const productsPayload = await this.reconcileOrderInventory(
          orderId,
          orderDb.products,
          productsDto,
          willBeCancelled,
          userId,
          tx,
        );
        if (productsPayload) Object.assign(orderPayload, productsPayload);
      }

      if (clientDto) await this.updateClientInfo(orderDb.client.id, clientDto, willBeWithoutInvoice, tx);

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
