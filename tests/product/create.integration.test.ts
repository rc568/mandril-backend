import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProductSchema } from '@/modules/product/schemas/product.schema';
import { db, productTable, productVariantTable, skuCounterTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
beforeEach(async () => {
  fixture = await createFixture();
});

describe('crear productos en PostgreSQL', () => {
  it('guarda el producto, la variante, su SKU y el usuario creador', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const stored = await db.query.productTable.findFirst({
      where: eq(productTable.slug, fixture.dto.slug),
      with: { productVariant: true },
    });
    expect(stored).toMatchObject({
      id: product.id,
      createdBy: fixture.user.id,
      categoryId: fixture.category.id,
      catalogId: fixture.catalog.id,
    });
    expect(stored?.productVariant).toEqual([
      expect.objectContaining({
        code: expect.stringMatching(/^MI\d{3}$/),
        quantityInStock: 10,
        createdBy: fixture.user.id,
      }),
    ]);
    expect(Number(stored?.productVariant[0].price)).toBe(100);
    expect(await productService.getByIdentifier(fixture.dto.slug)).toEqual(product);
  });

  it('guarda atributos y valores de dos variantes', async () => {
    const product = await productService.create(createProductSchema.parse(fixture.withAttributes), fixture.user.id);
    const variants = await db.query.productVariantTable.findMany({
      where: eq(productVariantTable.productId, Number(product.id)),
      with: { variantValues: true },
    });
    expect(variants).toHaveLength(2);
    expect(
      variants.flatMap((variant) => variant.variantValues.map((value) => value.variantAttributeValueId)).sort(),
    ).toEqual(
      fixture.values
        .slice(0, 2)
        .map((value) => value.id)
        .sort(),
    );
    expect(product.attributes).toEqual([expect.objectContaining({ id: fixture.attribute.id })]);
  });

  it('rechaza un slug repetido sin crear una segunda fila', async () => {
    await productService.create(fixture.dto, fixture.user.id);
    await expect(productService.create(fixture.dto, fixture.user.id)).rejects.toMatchObject({
      statusCode: 409,
      message: errorMessages.product.slugExists,
    });
    expect(await db.query.productTable.findMany({ where: eq(productTable.slug, fixture.dto.slug) })).toHaveLength(1);
  });

  it.each(['categoryId', 'catalogId'] as const)('rechaza una referencia inexistente: %s', async (field) => {
    await expect(productService.create({ ...fixture.dto, [field]: -1 }, fixture.user.id)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await db.query.productTable.findFirst({ where: eq(productTable.slug, fixture.dto.slug) })).toBeUndefined();
  });

  it('revierte producto, variantes y contador si falla el valor de la segunda variante', async () => {
    const dto = createProductSchema.parse(fixture.withAttributes);
    dto.variants[1].attributes = [{ attributeId: fixture.attribute.id, valueId: -1 }];
    const before = await db.query.skuCounterTable.findFirst({ where: eq(skuCounterTable.prefix, 'MI') });

    await expect(productService.create(dto, fixture.user.id)).rejects.toMatchObject({
      statusCode: 404,
      message: errorMessages.variantAttribueValue.notFoundInAttribute,
    });

    expect(await db.query.productTable.findFirst({ where: eq(productTable.slug, dto.slug) })).toBeUndefined();
    expect(
      await db.query.productVariantTable.findMany({ where: eq(productVariantTable.createdBy, fixture.user.id) }),
    ).toEqual([]);
    expect(await db.query.skuCounterTable.findFirst({ where: eq(skuCounterTable.prefix, 'MI') })).toEqual(before);
  });
});
