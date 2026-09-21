import { randomUUID } from 'node:crypto';
import { CatalogService } from '@/modules/catalog';
import { CategoryService } from '@/modules/category';
import { ProductService } from '@/modules/product';
import { createProductSchema } from '@/modules/product/schemas/product.schema';
import { SkuCounterService } from '@/modules/sku-counter';
import { VariantAttributeService, VariantAttributeValueService } from '@/modules/variant-attribute';
import {
  catalogTable,
  categoryTable,
  db,
  userTable,
  variantAttributeTable,
  variantAttributeValueTable,
} from '@/shared/db';
import { assertTestDatabase } from '../support/database';

export const productService = new ProductService(
  new CategoryService(),
  new CatalogService(),
  new VariantAttributeService(),
  new VariantAttributeValueService(),
  new SkuCounterService(),
);

// Cada caso tiene sus propios datos. Se eliminan junto con el contenedor al terminar.
export async function createFixture() {
  await assertTestDatabase();
  const tag = randomUUID();
  const [user] = await db
    .insert(userTable)
    .values({
      name: 'Vitest',
      lastName: 'Product',
      userName: `test-${tag}`,
      email: `${tag}@example.test`,
      password: 'unused',
    })
    .returning();
  const [category] = await db
    .insert(categoryTable)
    .values({ name: 'Categoría de prueba', slug: `cat-${tag}`, createdBy: user.id })
    .returning();
  const [catalog] = await db
    .insert(catalogTable)
    .values({ name: 'Catálogo de prueba', slug: `cat-${tag}`, createdBy: user.id })
    .returning();
  const [attribute] = await db
    .insert(variantAttributeTable)
    .values({ name: `Color-${tag.slice(0, 20)}` })
    .returning();
  const values = await db
    .insert(variantAttributeValueTable)
    .values([
      { value: 'Rojo', variantAttributeId: attribute.id },
      { value: 'Azul', variantAttributeId: attribute.id },
      { value: 'Verde', variantAttributeId: attribute.id },
    ])
    .returning();
  const input = {
    name: `Taladro ${tag}`,
    slug: `taladro-${tag}`,
    categoryId: category.id,
    catalogId: catalog.id,
    variants: [{ price: 100, purchasePrice: 60, quantityInStock: 10 }],
  };
  const withAttributes = {
    ...input,
    attributesId: [{ attributeId: attribute.id }],
    variants: values.slice(0, 2).map((value) => ({
      ...input.variants[0],
      attributes: [{ attributeId: attribute.id, valueId: value.id }],
    })),
  };
  return { user, category, catalog, attribute, values, input, withAttributes, dto: createProductSchema.parse(input) };
}

export type ProductFixture = Awaited<ReturnType<typeof createFixture>>;
