import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProductSchema } from '@/modules/product/schemas/product.schema';
import { db, productTable, productVariantTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
beforeEach(async () => {
  fixture = await createFixture();
});

describe('eliminación lógica', () => {
  it('elimina producto y variantes sin borrar las filas y las oculta de las consultas', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const id = Number(product.id);
    await productService.softDelete(id, fixture.user.id);

    const stored = await db.query.productTable.findFirst({
      where: eq(productTable.id, id),
      with: { productVariant: true },
    });
    expect(stored).toMatchObject({ deletedAt: expect.any(Date), deletedBy: fixture.user.id });
    expect(stored?.productVariant).toEqual([
      expect.objectContaining({ deletedAt: expect.any(Date), deletedBy: fixture.user.id }),
    ]);
    await expect(productService.getByIdentifier(id)).rejects.toMatchObject({ statusCode: 404 });
    expect((await productService.getAll({ categoryId: fixture.category.id })).products).toEqual([]);
    expect((await productService.getSearchProductVariants({ search: fixture.input.name })).products).toEqual([]);
  });

  it('impide eliminar la última variante', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const variant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.productId, Number(product.id)),
    });
    if (!variant) throw new Error('Falta la variante');
    await expect(
      productService.softDeleteVariant(Number(product.id), variant.id, fixture.user.id),
    ).rejects.toMatchObject({ statusCode: 409, message: errorMessages.product.cannotDeleteLastVariant });
    expect(
      (await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variant.id) }))?.deletedAt,
    ).toBeNull();
  });

  it('elimina una de dos variantes y conserva la otra visible', async () => {
    const product = await productService.create(createProductSchema.parse(fixture.withAttributes), fixture.user.id);
    const id = Number(product.id);
    const variants = await db.query.productVariantTable.findMany({
      where: eq(productVariantTable.productId, id),
      orderBy: productVariantTable.id,
    });
    await productService.softDeleteVariant(id, variants[0].id, fixture.user.id);
    expect((await productService.getByIdentifier(id)).productVariant).toEqual([
      expect.objectContaining({ id: variants[1].id }),
    ]);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variants[0].id) }),
    ).toMatchObject({ deletedAt: expect.any(Date), deletedBy: fixture.user.id });
    await expect(productService.softDeleteVariant(id, variants[0].id, fixture.user.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('rechaza productos y variantes inexistentes', async () => {
    await expect(productService.softDelete(-1, fixture.user.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(productService.softDeleteVariant(-1, -1, fixture.user.id)).rejects.toMatchObject({ statusCode: 404 });
    const product = await productService.create(fixture.dto, fixture.user.id);
    await expect(productService.softDeleteVariant(Number(product.id), -1, fixture.user.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
