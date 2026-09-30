import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, inventoryBalanceTable, productVariantTable } from '@/shared/db';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
beforeEach(async () => {
  fixture = await createFixture();
});

describe('consultas de productos', () => {
  it('muestra solo AVAILABLE en detalle, listado y búsqueda aunque el stock anterior difiera', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const [variant] = await db
      .select()
      .from(productVariantTable)
      .where(eq(productVariantTable.productId, Number(product.id)));
    await db.update(productVariantTable).set({ quantityInStock: 999 }).where(eq(productVariantTable.id, variant.id));
    await db.insert(inventoryBalanceTable).values([
      { productVariantId: variant.id, bucket: 'AVAILABLE', quantity: 7, updatedBy: fixture.user.id },
      { productVariantId: variant.id, bucket: 'RESERVED', quantity: 3, updatedBy: fixture.user.id },
      { productVariantId: variant.id, bucket: 'DEFECTIVE', quantity: 2, updatedBy: fixture.user.id },
      { productVariantId: variant.id, bucket: 'QUARANTINE', quantity: 4, updatedBy: fixture.user.id },
    ]);
    const expected = { productVariant: [expect.objectContaining({ id: variant.id, quantityInStock: 7 })] };
    expect(await productService.getByIdentifier(Number(product.id))).toMatchObject(expected);
    expect((await productService.getAll({ categoryId: fixture.category.id })).products).toEqual([
      expect.objectContaining(expected),
    ]);
    expect((await productService.getSearchProductVariants({ search: variant.code })).products).toEqual([
      expect.objectContaining({ variantId: variant.id, quantityInStock: 7 }),
    ]);
    await productService.update(Number(product.id), { name: 'Updated product' }, false, fixture.user.id);
    expect(
      await db.select().from(inventoryBalanceTable).where(eq(inventoryBalanceTable.productVariantId, variant.id)),
    ).toHaveLength(4);
    expect(await productService.getByIdentifier(Number(product.id))).toMatchObject(expected);
  });

  it('muestra cero para una variante nueva sin saldos', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    expect(product).toMatchObject({ productVariant: [expect.objectContaining({ quantityInStock: 0 })] });
    expect((await productService.getSearchProductVariants({ search: fixture.input.name })).products).toEqual([
      expect.objectContaining({ quantityInStock: 0 }),
    ]);
  });
  it('filtra por categoría, catálogo, precio y estado de la variante', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const filters = {
      categoryId: fixture.category.id,
      catalogId: fixture.catalog.id,
      minPrice: 90,
      maxPrice: 110,
      isActive: true,
    };
    const result = await productService.getAll(filters);
    expect(result.products).toEqual([expect.objectContaining({ id: product.id })]);
    expect(result.pagination.totalItems).toBe(1);
    expect((await productService.getAll({ ...filters, minPrice: 101 })).products).toEqual([]);
    expect((await productService.getAll({ ...filters, isActive: false })).products).toEqual([]);
  });

  it('pagina y ordena los productos sin repetirlos', async () => {
    for (let index = 0; index < 25; index++) {
      await productService.create(
        { ...fixture.dto, name: `Prueba ${String(index).padStart(2, '0')}`, slug: `${fixture.dto.slug}-${index}` },
        fixture.user.id,
      );
    }
    const first = await productService.getAll({
      categoryId: fixture.category.id,
      page: 1,
      limit: 24,
      orderBy: 'name_desc',
    });
    const second = await productService.getAll({
      categoryId: fixture.category.id,
      page: 2,
      limit: 24,
      orderBy: 'name_desc',
    });
    expect(first.products).toHaveLength(24);
    expect(second.products).toHaveLength(1);
    expect(first.pagination.totalItems).toBe(25);
    expect(first.products[0].name).toBe('Prueba 24');
    expect(second.products[0].name).toBe('Prueba 00');
  });

  it('busca por nombre y SKU, y trata la entrada SQL como texto', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const variant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.productId, Number(product.id)),
    });
    expect((await productService.getAll({ search: fixture.input.name })).products).toEqual([
      expect.objectContaining({ id: product.id }),
    ]);
    expect((await productService.getAll({ search: variant?.code })).products).toEqual([
      expect.objectContaining({ id: product.id }),
    ]);
    expect((await productService.getAll({ search: "' OR 1=1 --" })).products).toEqual([]);
  });

  it('mantiene el filtro de categoría cuando la búsqueda coincide con un SKU', async () => {
    const product = await productService.create(fixture.dto, fixture.user.id);
    const other = await createFixture();
    const variant = await db.query.productVariantTable.findFirst({
      where: eq(productVariantTable.productId, Number(product.id)),
    });
    // Un producto coincide por nombre y otro por SKU; solo uno pertenece a la categoría.
    await productService.create(
      { ...other.dto, slug: `${other.dto.slug}-sku`, name: variant?.code ?? '' },
      other.user.id,
    );
    const result = await productService.getAll({ categoryId: other.category.id, search: variant?.code });
    expect(result.products).toHaveLength(1);
    expect(result.products.map((item) => item.id)).not.toContain(product.id);
    expect(result.pagination.totalItems).toBe(1);
  });

  it('pagina la búsqueda de variantes con nextOffset', async () => {
    for (let index = 0; index < 11; index++) {
      await productService.create({ ...fixture.dto, slug: `${fixture.dto.slug}-${index}` }, fixture.user.id);
    }
    const first = await productService.getSearchProductVariants({ search: fixture.input.name, limit: 10 });
    const second = await productService.getSearchProductVariants({ search: fixture.input.name, limit: 10, offset: 10 });
    expect(first.products).toHaveLength(10);
    expect(first.pagination.nextOffset).toBe(10);
    expect(second.products).toHaveLength(1);
    expect(second.pagination.nextOffset).toBeNull();
    expect(new Set([...first.products, ...second.products].map((variant) => variant.variantId)).size).toBe(11);
  });

  it('rechaza un identificador inexistente y normaliza límites no permitidos', async () => {
    await expect(productService.getByIdentifier(-1)).rejects.toMatchObject({ statusCode: 404 });
    await expect(productService.getByIdentifier('slug-que-no-existe')).rejects.toMatchObject({ statusCode: 404 });
    expect((await productService.getAll({ categoryId: fixture.category.id, limit: 3 })).pagination.totalItems).toBe(0);
    expect(
      (await productService.getSearchProductVariants({ search: fixture.input.name, limit: 3 })).pagination,
    ).toEqual({ limit: 20, nextOffset: null });
  });
});
