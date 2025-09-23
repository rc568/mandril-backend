import { and, eq } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseError } from 'pg';
import { db, type Transaction } from '../../db';
import {
  productTable,
  productToVariantAttributeTable,
  productVariantTable,
  productVariantToValueTable,
} from '../../db/schemas';
import { VARIANT_PREFIX } from '../../domain/constants';
import { CustomError } from '../../domain/errors/custom.error';
import type { ProductDto, ProductUpdateDto } from '../validators';
import type { CatalogService } from './catalog.service';
import type { CategoryService } from './category.service';
import type { SkuCounter } from './sku-counter.service';
import type { VariantAttributeService } from './variant-attribute.service';
import type { VariantAttributeValueService } from './variant-attribute-value.service';

export class ProductService {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly catalogService: CatalogService,
    private readonly variantAttributeService: VariantAttributeService,
    private readonly variantAttributeValueService: VariantAttributeValueService,
    private readonly skuCounter: SkuCounter,
  ) {}

  private slugExists = async (slug: string, tx?: Transaction): Promise<boolean> => {
    const executor = tx ?? db;

    const product = await executor.query.productTable.findFirst({
      columns: { slug: true },
      where: eq(productTable.slug, slug),
    });

    if (!product) return false;
    return true;
  };

  private getProductbyId = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const product = await executor.query.productTable.findFirst({
      where: eq(productTable.id, id),
      columns: { id: true, slug: true },
      with: { productVariant: { columns: { id: true } }, attributes: { columns: { variantAttributeId: true } } },
    });

    return product;
  };

  getAll = async () => {
    const LIMIT = 24;

    const products = await db.query.productTable.findMany({
      limit: LIMIT,
      columns: { id: true, name: true, slug: true, description: true },
      with: {
        category: { columns: { name: true, slug: true } },
        catalog: { columns: { name: true, slug: true } },
        attributes: { columns: {}, with: { attributes: { columns: { name: true, description: true } } } },
        productVariant: {
          with: {
            images: { columns: { id: true, imageUrl: true } },
            variantValues: {
              columns: { variantAttributeValueId: false, productVariantId: false },
              with: {
                variantValues: {
                  columns: { value: true },
                  with: { attribute: { columns: { name: true } } },
                },
              },
            },
          },
          columns: {
            code: true,
            price: true,
            purchasePrice: true,
            quantityInStock: true,
          },
        },
      },
    });
    return products;
  };

  getByIdentifier = async (identifier: string | number, tx?: Transaction) => {
    const executor = tx ?? db;
    const isSlug = typeof identifier === 'string';

    const whereCondition = isSlug ? eq(productTable.slug, identifier) : eq(productTable.id, identifier);

    if (isSlug) {
      const prodExists = await this.slugExists(identifier);
      if (!prodExists) throw CustomError.notFound(`Product with slug: ${identifier} doesn't exist.`);
    }

    const product = await executor.query.productTable.findFirst({
      where: whereCondition,
      columns: { id: true, name: true, slug: true, description: true },
      with: {
        category: { columns: { name: true, slug: true } },
        catalog: { columns: { name: true, slug: true } },
        attributes: { columns: {}, with: { attributes: { columns: { name: true, description: true } } } },
        productVariant: {
          with: {
            images: { columns: { id: true, imageUrl: true } },
            variantValues: {
              columns: { variantAttributeValueId: false, productVariantId: false },
              with: {
                variantValues: {
                  columns: { value: true },
                  with: { attribute: { columns: { name: true } } },
                },
              },
            },
          },
          columns: {
            id: true,
            code: true,
            price: true,
            purchasePrice: true,
            quantityInStock: true,
          },
        },
      },
    });

    if (!product) {
      const identifierType = isSlug ? 'slug' : 'id';
      throw CustomError.notFound(`Product with ${identifierType}: ${identifier} doesn't exist.`);
    }

    const productToReturn = {
      ...product,
      attributes: product.attributes.map(({ attributes }) => ({ ...attributes })),
      productVariant: product.productVariant.map((p) => {
        const { variantValues, ...rest } = p;

        return {
          ...rest,
          variantAttributes: variantValues.map((v) => ({
            value: v.variantValues.value,
            attribute: v.variantValues.attribute?.name,
          })),
        };
      }),
    };

    return productToReturn;
  };

  // adminGetAll = async () => {
  //   // const LIMIT = 24;

  //   const products = await db.query.productVariantTable.findMany({
  //     columns: { code: true, price: true, purchasePrice: true, quantityInStock: true },
  //     with: {
  //       variantValuesMap: { with: { variantValue: { with: { attribute: true } } } },
  //       productParent: {
  //         columns: { name: true },
  //       },
  //     },
  //   });

  //   return products;
  // };

  create = async (productDto: ProductDto) => {
    const { variants, attributesId, ...product } = productDto;

    try {
      const newProd = await db.transaction(async (tx) => {
        const slugExists = await this.slugExists(product.slug, tx);
        if (slugExists) throw CustomError.conflict(`Product with slug ${product.slug} already exists in database.`);

        await this.categoryService.getById(product.categoryId, tx);
        await this.catalogService.getById(product.catalogId, tx);

        const [{ id: newProductId }] = await tx.insert(productTable).values(product).returning({
          id: productTable.id,
        });

        if (attributesId && attributesId.length > 0) {
          const productAttributes = attributesId.map((attr) => attr.attributeId);
          await Promise.all(productAttributes.map((id) => this.variantAttributeService.getById(id)));

          const variantAttributesToInsert = productAttributes.map((id) => ({
            productId: newProductId,
            variantAttributeId: id,
          }));

          await tx.insert(productToVariantAttributeTable).values(variantAttributesToInsert);
        }

        for (const variant of variants) {
          const { attributes, ...productVariant } = variant;

          const newCode = await this.skuCounter.create(VARIANT_PREFIX, tx);

          const [newVariantId] = await tx
            .insert(productVariantTable)
            .values({ ...productVariant, productId: newProductId, code: newCode })
            .returning({ id: productVariantTable.id });

          if (attributes && attributes.length > 0) {
            const valuesToInsert = [];

            for (const attribute of attributes) {
              const valueExists = await this.variantAttributeValueService.valueExists(
                attribute.attributeId,
                attribute.valueId,
                tx,
              );
              if (!valueExists)
                throw CustomError.notFound(
                  `Value with id ${attribute.valueId} doesn't exist or don't belong to corresponding attribute.`,
                );

              valuesToInsert.push(
                tx.insert(productVariantToValueTable).values({
                  productVariantId: newVariantId.id,
                  variantAttributeValueId: attribute.valueId,
                  variantAttributeId: attribute.attributeId,
                }),
              );
            }
            await Promise.all(valuesToInsert);
          }
        }

        return await this.getByIdentifier(newProductId, tx);
      });

      return newProd;
    } catch (error: unknown) {
      if (error instanceof DrizzleQueryError) {
        if (error.cause instanceof DatabaseError && error.cause.code === '23505') {
          if (error.cause.detail?.includes('slug')) {
            throw CustomError.conflict(`Product with slug '${product.slug}' already exists.`);
          }
          if (error.cause.detail?.includes('code')) {
            throw CustomError.conflict('A variant with one of the provided codes already exists.');
          }
          throw CustomError.conflict('A unique value constraint was violated.');
        }
      }

      throw error;
    }
  };

  update = async (id: number, productUpdateDto: ProductUpdateDto) => {
    const updateProduct = await db.transaction(async (tx) => {
      const productDb = await this.getProductbyId(id, tx);
      if (!productDb) throw CustomError.notFound(`Product with id: ${id} not found.`);

      const { variants, ...product } = productUpdateDto;
      if (productUpdateDto)
        if (product.slug && (await this.slugExists(product.slug, tx))) {
          throw CustomError.conflict(`Product with slug ${product.slug} already exists in database.`);
        }

      if (product.categoryId) {
        await this.categoryService.getById(product.categoryId, tx);
      }

      if (product.catalogId) {
        await this.catalogService.getById(product.catalogId, tx);
      }

      if (productDb.attributes.length === 0 && variants) {
        if (variants.some((v) => !!v.attributes)) {
          throw CustomError.badRequest(`Variant attributes where provided when product has no variant attributes.`);
        }
      }

      if (
        product.name ||
        product.slug ||
        product.description ||
        product.categoryId ||
        product.catalogId ||
        product.isActive !== undefined
      ) {
        await tx.update(productTable).set(product).where(eq(productTable.id, id));
      } else {
        if (!variants || variants.length === 0) {
          throw CustomError.badRequest('Variant data to update is empty.');
        }
      }

      const validVariantId = productDb.productVariant.map((p) => p.id);
      if (variants && variants.length > 0) {
        for (const variant of variants) {
          const { attributes, variantId, ...productVariant } = variant;

          if (!validVariantId.includes(variantId))
            throw CustomError.badRequest(`Variant with id ${variantId} doesn't belong to product.`);

          if (
            productVariant.price ||
            productVariant.purchasePrice ||
            productVariant.quantityInStock ||
            productVariant.isActive !== undefined
          ) {
            await tx.update(productVariantTable).set(productVariant).where(eq(productVariantTable.id, variantId));
          }

          if (attributes && attributes.length > 0) {
            for (const attribute of attributes) {
              const { attributeId, valueId } = attribute;

              await this.variantAttributeService.getById(attributeId, tx);
              const valueExists = await this.variantAttributeValueService.valueExists(attributeId, valueId, tx);
              if (!valueExists)
                throw CustomError.notFound(
                  `Value with id ${valueId} doesn't exist or don't belong to corresponding attribute.`,
                );

              const attributeVariantExists = await tx.query.productVariantToValueTable.findFirst({
                where: and(
                  eq(productVariantToValueTable.productVariantId, variantId),
                  eq(productVariantToValueTable.variantAttributeId, attributeId),
                ),
              });

              if (!attributeVariantExists)
                throw CustomError.notFound(`Attribute with ${attributeId} doesn't belong to variant attributes.`);

              await tx
                .update(productVariantToValueTable)
                .set({ variantAttributeValueId: valueId })
                .where(
                  and(
                    eq(productVariantToValueTable.productVariantId, variantId),
                    eq(productVariantToValueTable.variantAttributeId, attributeId),
                  ),
                );
            }
          }
        }
      }

      return this.getByIdentifier(id, tx);
    });

    return updateProduct;
  };
}
