import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createProductSchema, updateProductSchema } from '@/modules/product/schemas/product.schema';
import { db, productTable, productVariantTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
beforeEach(async () => {
  fixture = await createFixture();
});

async function createAttributedProduct() {
  const product = await productService.create(createProductSchema.parse(fixture.withAttributes), fixture.user.id);
  const id = Number(product.id);
  const variants = await db.query.productVariantTable.findMany({
    where: eq(productVariantTable.productId, id),
    orderBy: productVariantTable.id,
  });
  const input = {
    attributesId: fixture.withAttributes.attributesId,
    variants: fixture.withAttributes.variants.map((variant, index) => ({
      ...variant,
      isActive: true,
      variantId: variants[index].id,
    })),
  };
  return { id, variants, input };
}

describe('actualizar productos', () => {
  it('cambia los datos generales y registra updatedBy', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    await productService.update(Number(product.id), { name: 'Nuevo nombre', isActive: false }, false, fixture.user.id);
    expect(await db.query.productTable.findFirst({ where: eq(productTable.id, Number(product.id)) })).toMatchObject({
      name: 'Nuevo nombre',
      isActive: false,
      updatedBy: fixture.user.id,
    });
  });

  it('rechaza actualizar un producto inexistente', async () => {
    await expect(productService.update(-1, { name: 'Nuevo' }, false, fixture.user.id)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('actualiza una variante y valida la oferta persistida aunque el DTO la omita', async () => {
    const dto = createProductSchema.parse({
      ...fixture.input,
      variants: [
        {
          ...fixture.input.variants[0],
          offerPrice: 80,
          offerStartsAt: '2026-01-01T00:00:00Z',
          offerEndsAt: '2026-02-01T00:00:00Z',
        },
      ],
    });
    const product = await productService.create(dto, fixture.user.id);
    const variant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.productId, Number(product.id)),
    });
    const update = updateProductSchema.parse({
      variants: [{ ...fixture.input.variants[0], variantId: variant?.id, isActive: true, price: 70 }],
    });
    await expect(productService.update(Number(product.id), update, false, fixture.user.id)).rejects.toMatchObject({
      message: errorMessages.product.invalidOfferPrice,
    });
    expect(
      Number(
        (await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.productId, Number(product.id)) }))
          ?.price,
      ),
    ).toBe(100);

    if (!update.variants) throw new Error('Faltan las variantes del caso de prueba');
    update.variants[0].offerPrice = null;
    update.variants[0].offerStartsAt = null;
    update.variants[0].offerEndsAt = null;
    await productService.update(Number(product.id), update, false, fixture.user.id);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.productId, Number(product.id)) }),
    ).toMatchObject({ offerPrice: null, updatedBy: fixture.user.id });
  });

  it('edita variantes y agrega una combinación nueva', async () => {
    const { id, input } = await createAttributedProduct();
    const dto = updateProductSchema.parse({
      ...input,
      variants: [
        { ...input.variants[0], quantityInStock: 25 },
        input.variants[1],
        {
          ...fixture.input.variants[0],
          isActive: true,
          attributes: [{ attributeId: fixture.attribute.id, valueId: fixture.values[2].id }],
        },
      ],
    });
    await productService.update(id, dto, false, fixture.user.id);
    const variants = await db.query.productVariantTable.findMany({
      where: eq(productVariantTable.productId, id),
      orderBy: productVariantTable.id,
    });
    expect(variants).toHaveLength(3);
    expect(variants[0]).toMatchObject({ quantityInStock: 25, updatedBy: fixture.user.id });
    expect(variants[2].createdBy).toBe(fixture.user.id);
  });

  it('rechaza usar una variante de otro producto y revierte los cambios', async () => {
    const { id, input } = await createAttributedProduct();
    const other = await productService.create({ ...fixture.dto, slug: `${fixture.dto.slug}-otro` }, fixture.user.id);
    const otherVariant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.productId, Number(other.id)),
    });
    if (!otherVariant) throw new Error('No se creó la variante del otro producto');
    input.variants[0].variantId = otherVariant.id;
    input.variants[0].attributes[0].valueId = fixture.values[2].id;
    await expect(
      productService.update(id, updateProductSchema.parse({ ...input, name: 'No guardar' }), false, fixture.user.id),
    ).rejects.toMatchObject({ message: errorMessages.product.invalidVariant });
    expect((await db.query.productTable.findFirst({ where: eq(productTable.id, id) }))?.name).toBe(fixture.input.name);
  });

  it('exige force para retirar todos los atributos y elimina las variantes omitidas', async () => {
    const { id, variants } = await createAttributedProduct();
    const dto = updateProductSchema.parse({
      variants: [{ ...fixture.input.variants[0], variantId: variants[0].id, isActive: true }],
    });
    await expect(productService.update(id, dto, false, fixture.user.id)).rejects.toMatchObject({
      message: errorMessages.product.deleteCurrenteAttributesNotAllowed,
    });
    await productService.update(id, dto, true, fixture.user.id);
    const stored = await db.query.productTable.findFirst({
      where: eq(productTable.id, id),
      with: { attributes: true, productVariant: true },
    });
    expect(stored?.attributes).toEqual([]);
    expect(stored?.productVariant.find((variant) => variant.id === variants[1].id)).toMatchObject({
      deletedAt: expect.any(Date),
      deletedBy: fixture.user.id,
    });
  });

  it('restaura una variante eliminada cuando se reenvía su misma combinación', async () => {
    const { id, variants, input } = await createAttributedProduct();
    await productService.softDeleteVariant(id, variants[1].id, fixture.user.id);
    await productService.update(id, updateProductSchema.parse(input), false, fixture.user.id);
    expect(
      await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.id, variants[1].id) }),
    ).toMatchObject({ deletedAt: null, deletedBy: null });
  });
});
