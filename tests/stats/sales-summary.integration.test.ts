import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatsService } from '@/modules/stats/stats.service';
import {
  clientTable,
  db,
  orderProductTable,
  orderTable,
  productTable,
  productVariantTable,
  salesChannelTable,
  userTable,
} from '@/shared/db';
import { resetTestSchema } from '../support/schema';

beforeEach(resetTestSchema);

async function createOrderData() {
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Stats',
      lastName: 'Sales',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  const [client] = await db.insert(clientTable).values({ contactName: 'Stats client', createdBy: user.id }).returning();
  const [channel] = await db
    .insert(salesChannelTable)
    .values({ channel: tag.slice(0, 25), createdBy: user.id })
    .returning();
  const [product] = await db
    .insert(productTable)
    .values({ name: 'Stats product', slug: tag, createdBy: user.id })
    .returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      ['10101', '10102'].map((code) => ({
        productId: product.id,
        code,
        price: '100.000000',
        purchasePrice: '60.000000',
        createdBy: user.id,
      })),
    )
    .returning();

  const insertOrder = async (input: {
    type: 'SALE' | 'RETURN' | 'EXCHANGE';
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    totalSale: string;
    totalCost: string;
    createdAt: string;
    relatedOrderId?: string;
    deleted?: boolean;
  }) => {
    const [order] = await db
      .insert(orderTable)
      .values({
        type: input.type,
        status: input.status,
        salesChannelId: channel.id,
        clientId: client.id,
        totalSale: input.totalSale,
        totalCost: input.totalCost,
        numProducts: 1,
        relatedOrderId: input.relatedOrderId,
        createdAt: new Date(input.createdAt),
        createdBy: user.id,
        ...(input.deleted ? { deletedAt: new Date(input.createdAt), deletedBy: user.id } : {}),
      })
      .returning();
    return order;
  };

  const insertLine = async (
    orderId: string,
    variantId: number,
    type: 'SALE' | 'RETURN',
    price: string,
    purchasePrice: string,
    quantity: number,
  ) => {
    await db.insert(orderProductTable).values({
      orderId,
      productVariantId: variantId,
      type,
      price,
      purchasePrice,
      quantity,
    });
  };

  const sale = await insertOrder({
    type: 'SALE',
    status: 'COMPLETED',
    totalSale: '100.000000',
    totalCost: '60.000000',
    createdAt: '2026-10-04T12:00:00-05:00',
  });
  await insertLine(sale.id, variants[0].id, 'SALE', '50.000000', '30.000000', 2);

  const returned = await insertOrder({
    type: 'RETURN',
    status: 'COMPLETED',
    totalSale: '50.000000',
    totalCost: '30.000000',
    createdAt: '2026-10-05T12:00:00-05:00',
    relatedOrderId: sale.id,
  });
  await insertLine(returned.id, variants[0].id, 'RETURN', '50.000000', '30.000000', 1);

  const exchange = await insertOrder({
    type: 'EXCHANGE',
    status: 'COMPLETED',
    totalSale: '30.000000',
    totalCost: '18.000000',
    createdAt: '2026-10-06T12:00:00-05:00',
    relatedOrderId: sale.id,
  });
  await insertLine(exchange.id, variants[0].id, 'SALE', '80.000000', '48.000000', 1);
  await insertLine(exchange.id, variants[0].id, 'RETURN', '50.000000', '30.000000', 1);

  const pending = await insertOrder({
    type: 'SALE',
    status: 'PENDING',
    totalSale: '500.000000',
    totalCost: '300.000000',
    createdAt: '2026-10-07T12:00:00-05:00',
  });
  await insertLine(pending.id, variants[1].id, 'SALE', '500.000000', '300.000000', 1);

  const cancelled = await insertOrder({
    type: 'RETURN',
    status: 'CANCELLED',
    totalSale: '100.000000',
    totalCost: '60.000000',
    createdAt: '2026-10-08T12:00:00-05:00',
    relatedOrderId: sale.id,
  });
  await insertLine(cancelled.id, variants[0].id, 'RETURN', '100.000000', '60.000000', 1);

  const deleted = await insertOrder({
    type: 'SALE',
    status: 'COMPLETED',
    totalSale: '999.000000',
    totalCost: '600.000000',
    createdAt: '2026-10-09T12:00:00-05:00',
    deleted: true,
  });
  await insertLine(deleted.id, variants[0].id, 'SALE', '999.000000', '600.000000', 1);

  return variants;
}

describe('estadísticas de ventas', () => {
  it('resta devoluciones, conserva el neto de cambios y usa el período de creación', async () => {
    await createOrderData();
    const result = await new StatsService().salesSummary({
      view: 'range',
      startDate: '2026-10-01T00:00:00-05:00',
      endDate: '2026-10-20T23:59:59-05:00',
    });

    expect(result.summary).toMatchObject({
      ordersCount: '3',
      totalRevenue: '80.000000',
      totalCost: '48.000000',
      totalProfit: '32.000000',
    });
    expect(result.distributionChart.data).toHaveLength(1);
    expect(result.distributionChart.data[0]).toMatchObject({
      ordersCount: '3',
      totalRevenue: '80.000000',
      totalCost: '48.000000',
      totalProfit: '32.000000',
    });

    const nonZeroDailyRevenue = result.evolutionChart.data
      .map((row) => String(row.totalRevenue))
      .filter((amount) => !/^0(?:\.0+)?$/.test(amount))
      .sort();
    expect(nonZeroDailyRevenue).toEqual(['-50.000000', '100.000000', '30.000000']);
  });

  it('filtra ranking y paginación a órdenes completadas no eliminadas y resta sus líneas RETURN', async () => {
    await createOrderData();
    const result = await new StatsService().rankingProducts({ view: 'historical', orderBy: 'revenue_desc' });

    expect(result._metadata.pagination.totalItems).toBe(1);
    expect(result.rankingProducts).toHaveLength(1);
    expect(result.rankingProducts[0]).toMatchObject({
      totalQuantitySold: '1',
      totalRevenue: '80.000000',
      totalCost: '48.000000',
      totalProfit: '32.000000',
    });
  });
});
