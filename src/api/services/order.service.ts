import { eq, type SQL, sql } from 'drizzle-orm';
import { db, type Transaction } from '../../db';
import { clientTable, orderProductTable, orderTable, salesChannelTable } from '../../db/schemas';
import type { OrderOutput } from '../../db/types';
import { CustomError } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';
import { INVOICE_TYPE, ORDER_STATUS, type OrderOptions } from '../../domain/order';
import { calculatePagination, getOrderProducts, isOneOf, setOrderSortBy } from '../utils';
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
    limit = 100,
    page = 1,
    sortBy,
    search,
  }: OrderOptions) => {
    const whereConditions: SQL[] = [];

    if (minDate) whereConditions.push(sql`o.created_at >= ${minDate}`);
    if (maxDate) whereConditions.push(sql`o.created_at <= ${maxDate}`);
    if (channel) whereConditions.push(sql`o.sales_channel_id = ${+channel}`);
    if (invoiceType && isOneOf(invoiceType, INVOICE_TYPE)) whereConditions.push(sql`o.invoice_type = ${invoiceType}`);
    if (status && isOneOf(status, ORDER_STATUS)) whereConditions.push(sql`o.status = ${status}`);
    if (search) {
      const searchTerm = `%${search}%`;
      whereConditions.push(sql`(
        o.invoice_code ILIKE ${searchTerm}
        OR c.bussiness_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
      )`);
    }

    const countQuery = sql.raw(`
      SELECT
        COUNT(o.id) AS total
      FROM
        "order" o
        INNER JOIN client c ON o.client_id = c.id
      WHERE o.deleted_at IS NULL
    `);

    if (whereConditions.length > 0) {
      countQuery.append(sql` AND `.append(sql.join(whereConditions, sql` AND `)));
    }

    const totalResult = await db.execute(countQuery);
    const totalItems = (totalResult.rows[0] as { total: string }).total;

    const pagination = calculatePagination(parseInt(totalItems), page, limit);
    if (pagination.totalItems === 0) {
      return {
        pagination,
        orders: [],
      };
    }

    const sqlToExecute = sql.raw(`
      WITH
        product_from_orders AS (
          SELECT
            op.order_id,
            json_agg(jsonb_build_object('variantId', pv.id, 'price', op.price, 'quantity', op.quantity, 'code', pv.code, 'name', p."name")) AS products
          FROM
            order_products op
            INNER JOIN product_variant pv ON op.product_variant_id = pv.id
            INNER JOIN product p ON pv.product_id = p.id
          GROUP BY
            op.order_id
        )
      SELECT
        o.id,
        o.invoice_type as "invoiceType",
        o.invoice_code as "invoiceCode",
        o.status,
        o.observation,
        o.total_sale as "totalSale",
	      o.num_products as "numProducts",
        TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        u.user_name as "createdBy",
        jsonb_build_object('id', c.id, 'email', c.email, 'phoneNumber1', c.phone_number1, 'contactName', c.contact_name, 'documentNumber', c.document_number, 'documentType', c.document_type, 'bussinessName', c.bussiness_name) AS client,
        s.channel,
        po.products
      FROM
        "order" o
        INNER JOIN client c ON o.client_id = c.id
        INNER JOIN sales_channel s ON o.sales_channel_id = s.id
        INNER JOIN product_from_orders po ON o.id = po.order_id
        INNER JOIN "user" u ON o.created_by = u.id
      WHERE o.deleted_at IS NULL
    `);

    if (whereConditions.length > 0) {
      sqlToExecute.append(sql` AND `.append(sql.join(whereConditions, sql` AND `)));
    }

    sqlToExecute.append(setOrderSortBy(sortBy));
    sqlToExecute.append(sql` LIMIT ${limit ?? 100}`);

    const orders = await db.execute(sqlToExecute);

    return {
      pagination,
      orders: orders.rows,
    };
  };

  getById = async (id: string, tx?: Transaction) => {
    const executor = tx ?? db;

    const sqlToExecute = sql`
      WITH
        product_from_orders AS (
          SELECT
            op.order_id,
            json_agg(jsonb_build_object('variantId', pv.id, 'price', op.price, 'quantity', op.quantity, 'code', pv.code, 'name', p."name")) AS products
          FROM
            order_products op
            INNER JOIN product_variant pv ON op.product_variant_id = pv.id
            INNER JOIN product p ON pv.product_id = p.id
          GROUP BY
            op.order_id
        )
      SELECT
        o.id,
        o.invoice_type as "invoiceType",
        o.invoice_code as "invoiceCode",
        o.status,
        o.observation,
        o.total_sale as "totalSale",
	      o.num_products as "numProducts",
        TO_CHAR(o.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        u.user_name as "createdBy",
        jsonb_build_object('id', c.id, 'email', c.email, 'phoneNumber1', c.phone_number1, 'contactName', c.contact_name, 'documentNumber', c.document_number, 'documentType', c.document_type, 'bussinessName', c.bussiness_name) AS client,
        s.channel,
        po.products
      FROM
        "order" o
        INNER JOIN client c ON o.client_id = c.id
        INNER JOIN sales_channel s ON o.sales_channel_id = s.id
        INNER JOIN product_from_orders po ON o.id = po.order_id
        INNER JOIN "user" u ON o.created_by = u.id
      WHERE o.id = ${id} AND o.deleted_at IS NULL
    `;

    const order = await executor.execute(sqlToExecute);

    if (order.rows.length === 0) throw CustomError.notFound(errorMessages.order.notFound);

    return order.rows[0] as unknown as OrderOutput;
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
