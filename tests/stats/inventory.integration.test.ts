import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { StatsService } from '@/modules/stats/stats.service';
import { db, inventoryBalanceTable, productTable, productVariantTable, userTable } from '@/shared/db';
import { resetTestSchema } from '../support/schema';

beforeEach(resetTestSchema);

async function createInventory() {
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Stats',
      lastName: 'Test',
      userName: tag,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  const [product] = await db.insert(productTable).values({ name: 'Camera', slug: tag, createdBy: user.id }).returning();
  const variants = await db
    .insert(productVariantTable)
    .values(
      ['ST001', 'ST002', 'ST003'].map((code) => ({
        productId: product.id,
        code,
        price: '100.000000',
        purchasePrice: '60.000000',
        createdBy: user.id,
      })),
    )
    .returning();
  await db.insert(inventoryBalanceTable).values([
    { productVariantId: variants[0].id, bucket: 'AVAILABLE', quantity: 7, updatedBy: user.id },
    { productVariantId: variants[0].id, bucket: 'RESERVED', quantity: 3, updatedBy: user.id },
    { productVariantId: variants[0].id, bucket: 'DEFECTIVE', quantity: 2, updatedBy: user.id },
    { productVariantId: variants[0].id, bucket: 'QUARANTINE', quantity: 4, updatedBy: user.id },
    { productVariantId: variants[1].id, bucket: 'AVAILABLE', quantity: 0, updatedBy: user.id },
    { productVariantId: variants[1].id, bucket: 'RESERVED', quantity: 5, updatedBy: user.id },
  ]);
}

describe('estadísticas de inventario', () => {
  it('usa solo AVAILABLE sin duplicar variantes y considera agotados los saldos ausentes o cero', async () => {
    await createInventory();
    const { inventory } = await new StatsService().inventory();
    expect(inventory).toMatchObject({
      productsCount: '3',
      active: '3',
      nonActive: '0',
      deleted: '0',
      outOfStock: '2',
      totalCapital: '420.000000',
      totalRevenue: '700.000000',
    });
  });

  it('muestra AVAILABLE en productos sin ventas y conserva la paginación', async () => {
    await createInventory();
    const result = await new StatsService().coldProducts({ orderBy: 'name_asc', limit: 10, page: 1 });
    expect(result._metadata?.pagination.totalItems).toBe(3);
    expect(result.coldProducts).toHaveLength(3);
    expect(result.coldProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ST001', currentStock: 7 }),
        expect.objectContaining({ code: 'ST002', currentStock: 0 }),
        expect.objectContaining({ code: 'ST003', currentStock: 0 }),
      ]),
    );
  });

  it('devuelve importes cero cuando todavía no hay variantes', async () => {
    const { inventory } = await new StatsService().inventory();
    expect(inventory).toMatchObject({ productsCount: '0', totalCapital: '0', totalRevenue: '0' });
  });
});
