import { eq } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { resumeOrdersQuery, searchOrdersQuery } from '../../db/queries/order.queries';
import { clientTable, orderProductTable, orderTable, salesChannelTable } from '../../db/schemas';
import type { OrderOutput } from '../../db/types';
import { CustomError } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';
import type { OrderOptions } from '../../domain/order';
import { DEFAULT_LIMIT, DEFAULT_PAGE, PAGINATION_LIMITS } from '../../domain/shared';
import { calculatePagination, getOrderProducts } from '../utils';
import { invoiceSchema, type OrderDto, type OrderUpdateDto } from '../validators';
import type { ProductService } from './product.service';

export class OrderService {
  constructor(private readonly productService: ProductService) {}
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

  create = async (order: OrderDto, userId: string) => {
    const { client, products, ...rest } = order;

    const newOrder = await db.transaction(async (tx) => {
      const salesChannelExists = await tx.query.salesChannelTable.findFirst({
        where: eq(salesChannelTable.id, rest.salesChannelId),
      });
      if (!salesChannelExists) throw CustomError.notFound(errorMessages.salesChannel.notFound);

      const productsToProcess = await Promise.all(
        products.map(async (p) => {
          const variant = await this.productService.getVariantByIdForUpdate(p.variantId, tx);
          if (!variant) throw CustomError.notFound(errorMessages.product.variantNotFoundById);
          if (variant.quantityInStock < p.quantity) throw CustomError.conflict(errorMessages.order.outOfStock);

          return {
            ...p,
            variantId: p.variantId,
            productId: variant.productId,
            currentStock: variant.quantityInStock,
          };
        }),
      );

      const [{ id: newClientId }] = await tx.insert(clientTable).values(client).returning({ id: clientTable.id });
      const { numProducts, totalSale } = products.reduce(
        (acc, curr) => ({
          totalSale: acc.totalSale + curr.price * curr.quantity,
          numProducts: acc.numProducts + curr.quantity,
        }),
        { totalSale: 0, numProducts: 0 },
      );

      const [{ id: newOrderId }] = await tx
        .insert(orderTable)
        .values({
          ...rest,
          clientId: newClientId,
          createdBy: userId,
          totalSale: totalSale.toFixed(6),
          numProducts,
        })
        .returning({
          id: orderTable.id,
        });

      const productsToInsert = productsToProcess.map((p) => ({
        orderId: newOrderId,
        price: p.price.toFixed(6),
        productVariantId: p.variantId,
        quantity: p.quantity,
      }));

      await tx.insert(orderProductTable).values(productsToInsert);

      for (const p of productsToProcess) {
        await this.productService.addStockForOrder(
          { variantId: p.variantId, stockToAdd: p.currentStock - p.quantity },
          userId,
          tx,
        );
      }

      return await this.getById(newOrderId, tx);
    });

    return newOrder;
  };

  update = async (orderId: string, data: OrderUpdateDto, userId: string) => {
    const { client, products, ...rest } = data;

    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(orderId, tx);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      const willOrderBeCancelled = orderDb.status !== 'CANCELLED' && rest.status === 'CANCELLED';
      const willOrderBeWithoutInvoice = rest.invoiceType === 'SIN COMPROBANTE';
      const hasOrderMainReqFields = Object.keys(rest).length > 0;
      const orderUpdatePayload = {};

      if (!willOrderBeWithoutInvoice) {
        const invoiceMergeData = {
          ...orderDb,
          ...rest,
          client: {
            ...orderDb.client,
            ...client,
          },
        };

        await invoiceSchema.parseAsync(invoiceMergeData);
      }

      if (hasOrderMainReqFields) {
        if (rest.salesChannelId) {
          const channelDb = await tx.query.salesChannelTable.findFirst({
            where: eq(salesChannelTable.id, rest.salesChannelId),
            columns: { id: true, channel: true },
          });

          if (!channelDb) throw CustomError.notFound(errorMessages.salesChannel.notFound);
        }

        if (willOrderBeCancelled) {
          const returnStockPromises = orderDb.products.map((op) => {
            return this.productService.addStockForOrder(
              { variantId: op.variantId, stockToAdd: op.quantity },
              userId,
              tx,
            );
          });
          await Promise.all(returnStockPromises);
        } else if (orderDb.status === 'CANCELLED' && rest.status !== 'CANCELLED' && rest.status !== undefined) {
          throw CustomError.conflict(errorMessages.order.cannotSetStatusOfCancelledOrder);
        }

        Object.assign(orderUpdatePayload, rest);

        if (willOrderBeWithoutInvoice) {
          Object.assign(orderUpdatePayload, { invoiceCode: null });
        }
      }

      if (products && !willOrderBeCancelled) {
        if (orderDb.status === 'CANCELLED') {
          throw CustomError.conflict(errorMessages.order.cannotModifyProductsInCancelledOrder);
        }

        const fullOrderProducts = getOrderProducts(products, orderDb.products);

        await tx.delete(orderProductTable).where(eq(orderProductTable.orderId, orderId));

        const stockUpdatePromises = fullOrderProducts.map((p) => {
          return this.productService.addStockForOrder({ variantId: p.variantId, stockToAdd: p.stockToAdd }, userId, tx);
        });
        await Promise.all(stockUpdatePromises);

        const orderProductToAdd = fullOrderProducts.filter((p) => !p.deletedProduct);

        const { numProducts, totalSale } = orderProductToAdd
          .filter((p) => !p.deletedProduct)
          .reduce(
            (acc, curr) => ({
              totalSale: acc.totalSale + curr.price * curr.quantity,
              numProducts: acc.numProducts + curr.quantity,
            }),
            { totalSale: 0, numProducts: 0 },
          );

        Object.assign(orderUpdatePayload, { numProducts: numProducts, totalSale: totalSale.toFixed(6) });

        const orderProductsToInsert = orderProductToAdd
          .filter((p) => !p.deletedProduct)
          .map((p) => {
            return {
              price: p.price.toFixed(6),
              quantity: p.quantity,
              productVariantId: p.variantId,
              orderId: orderId,
            };
          });

        await tx.insert(orderProductTable).values(orderProductsToInsert);
      }

      if (client) {
        if (willOrderBeWithoutInvoice) {
          await tx
            .update(clientTable)
            .set({ ...client, bussinessName: null, documentNumber: null, documentType: 'SIN DOCUMENTO' })
            .where(eq(clientTable.id, orderDb.client.id));
        } else {
          await tx.update(clientTable).set(client).where(eq(clientTable.id, orderDb.client.id));
        }
      }

      if (Object.keys(orderUpdatePayload).length > 0) {
        await tx
          .update(orderTable)
          .set({ ...orderUpdatePayload, updatedBy: userId })
          .where(eq(orderTable.id, orderId));
      }

      return await this.getById(orderId, tx);
    });
  };

  softDelete = async (id: string, userId: string): Promise<boolean> => {
    return await db.transaction(async (tx) => {
      const orderDb = await this.getById(id, tx);
      if (!orderDb) throw CustomError.notFound(errorMessages.order.notFound);

      await tx.update(orderTable).set({ deletedAt: new Date(), updatedBy: userId }).where(eq(orderTable.id, id));

      return true;
    });
  };
}
