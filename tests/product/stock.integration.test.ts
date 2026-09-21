import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, productVariantTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
let variantId: number;
beforeEach(async () => {
  fixture = await createFixture();
  const product = await productService.create(fixture.dto, fixture.user.id);
  const variant = await db.query.productVariantTable.findFirst({
    where: eq(productVariantTable.productId, Number(product.id)),
  });
  if (!variant) throw new Error('Falta la variante');
  variantId = variant.id;
});

const readVariant = () => db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variantId) });

describe('stock que utiliza orders', () => {
  it('descuenta y devuelve stock dentro de una transacción', async () => {
    await db.transaction(async (tx) => {
      await productService.addStockForOrder({ variantId, stockToAdd: -4 }, fixture.user.id, tx);
      await productService.addStockForOrder({ variantId, stockToAdd: 2 }, fixture.user.id, tx);
    });
    expect(await readVariant()).toMatchObject({ quantityInStock: 8, updatedBy: fixture.user.id });
  });

  it('rechaza stock negativo y conserva la cantidad anterior', async () => {
    await expect(
      db.transaction((tx) => productService.addStockForOrder({ variantId, stockToAdd: -11 }, fixture.user.id, tx)),
    ).rejects.toMatchObject({ statusCode: 409, message: errorMessages.order.outOfStock });
    expect((await readVariant())?.quantityInStock).toBe(10);
  });

  it('revierte el movimiento si falla la operación que lo contiene', async () => {
    await expect(
      db.transaction(async (tx) => {
        await productService.addStockForOrder({ variantId, stockToAdd: -4 }, fixture.user.id, tx);
        throw new Error('Falla posterior del pedido');
      }),
    ).rejects.toThrow('Falla posterior del pedido');
    expect((await readVariant())?.quantityInStock).toBe(10);
  });

  it('rechaza una variante inexistente', async () => {
    await expect(
      productService.addStockForOrder({ variantId: -1, stockToAdd: 1 }, fixture.user.id),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('dos descuentos simultáneos no pueden vender más unidades que el stock', async () => {
    const results = await Promise.allSettled([
      db.transaction((tx) => productService.addStockForOrder({ variantId, stockToAdd: -7 }, fixture.user.id, tx)),
      db.transaction((tx) => productService.addStockForOrder({ variantId, stockToAdd: -7 }, fixture.user.id, tx)),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { statusCode: 409, message: errorMessages.order.outOfStock },
    });
    expect((await readVariant())?.quantityInStock).toBe(3);
  });
});
