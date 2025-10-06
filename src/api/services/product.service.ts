import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseError } from 'pg';
import { db, type Transaction } from '../../db';
import {
  productTable,
  productToVariantAttributeTable,
  productVariantTable,
  productVariantToValueTable,
} from '../../db/schemas';
import { errorCodes, errorMessages, VARIANT_PREFIX } from '../../domain/constants';
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
      where: and(eq(productTable.id, id), isNull(productTable.deletedAt)),
      columns: { id: true, slug: true },
      with: {
        productVariant: { columns: { id: true }, where: isNull(productVariantTable.deletedAt) },
        attributes: { columns: { variantAttributeId: true } },
      },
    });

    return product;
  };

  getAll = async () => {
    const LIMIT = 24;

    const products = await db.query.productTable.findMany({
      limit: LIMIT,
      columns: { id: true, name: true, slug: true, description: true },
      where: isNull(productTable.deletedAt),
      with: {
        category: { columns: { name: true, slug: true } },
        catalog: { columns: { name: true, slug: true } },
        attributes: { columns: {}, with: { attributes: { columns: { name: true, description: true } } } },
        productVariant: {
          where: isNull(productVariantTable.deletedAt),
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
      if (!prodExists) throw CustomError.notFound(errorMessages.product.notFoundBySlug);
    }

    const product = await executor.query.productTable.findFirst({
      where: and(whereCondition, isNull(productTable.deletedAt)),
      columns: { id: true, name: true, slug: true, description: true },
      with: {
        category: { columns: { name: true, slug: true } },
        catalog: { columns: { name: true, slug: true } },
        attributes: { columns: {}, with: { attributes: { columns: { name: true, description: true } } } },
        productVariant: {
          where: isNull(productVariantTable.deletedAt),
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
      const message = isSlug ? errorMessages.product.notFoundBySlug : errorMessages.product.notFoundById;
      throw CustomError.notFound(message);
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

  create = async (productDto: ProductDto, userId: string) => {
    const { variants, attributesId, ...product } = productDto;

    try {
      const newProd = await db.transaction(async (tx) => {
        const slugExists = await this.slugExists(product.slug, tx);
        if (slugExists) throw CustomError.conflict(errorMessages.product.slugExists);

        await this.categoryService.getById(product.categoryId, tx);
        await this.catalogService.getById(product.catalogId, tx);

        const [{ id: newProductId }] = await tx
          .insert(productTable)
          .values({ ...product, createdBy: userId })
          .returning({
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
            .values({ ...productVariant, productId: newProductId, code: newCode, createdBy: userId })
            .returning({ id: productVariantTable.id });

          if (attributes && attributes.length > 0) {
            const valuesToInsert = [];

            for (const attribute of attributes) {
              const valueExists = await this.variantAttributeValueService.valueExists(
                attribute.attributeId,
                attribute.valueId,
                tx,
              );
              if (!valueExists) throw CustomError.notFound(errorMessages.variantAttribueValue.notFoundInAttribute);

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
            throw CustomError.conflict(errorMessages.product.slugExists);
          }
          if (error.cause.detail?.includes('code')) {
            throw CustomError.conflict(errorMessages.product.codeExists);
          }
          throw CustomError.conflict(errorMessages.product.uniqueConstraint);
        }
      }

      throw error;
    }
  };

  update = async (id: number, productUpdateDto: ProductUpdateDto, userId: string) => {
    const updateProduct = await db.transaction(async (tx) => {
      const productDb = await this.getProductbyId(id, tx);
      if (!productDb) throw CustomError.notFound(errorMessages.product.notFoundById);

      const { variants, ...product } = productUpdateDto;
      if (productUpdateDto)
        if (product.slug && (await this.slugExists(product.slug, tx))) {
          throw CustomError.conflict(errorMessages.product.slugExists);
        }

      if (product.categoryId) {
        await this.categoryService.getById(product.categoryId, tx);
      }

      if (product.catalogId) {
        await this.catalogService.getById(product.catalogId, tx);
      }

      if (productDb.attributes.length === 0 && variants) {
        if (variants.some((v) => !!v.attributes)) {
          throw CustomError.badRequest(errorMessages.product.noVariantAttributes);
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
        await tx
          .update(productTable)
          .set({ ...product, updatedBy: userId })
          .where(eq(productTable.id, id));
      } else {
        if (!variants || variants.length === 0) {
          throw CustomError.badRequest(errorMessages.product.noVariantData);
        }
      }

      const validVariantId = productDb.productVariant.map((p) => p.id);
      if (variants && variants.length > 0) {
        for (const variant of variants) {
          const { attributes, variantId, ...productVariant } = variant;

          if (!validVariantId.includes(variantId)) throw CustomError.badRequest(errorMessages.product.invalidVariant);

          if (
            productVariant.price ||
            productVariant.purchasePrice ||
            productVariant.quantityInStock ||
            productVariant.isActive !== undefined
          ) {
            await tx
              .update(productVariantTable)
              .set({ ...productVariant, createdBy: userId })
              .where(eq(productVariantTable.id, variantId));
          }

          if (attributes && attributes.length > 0) {
            for (const attribute of attributes) {
              const { attributeId, valueId } = attribute;

              await this.variantAttributeService.getById(attributeId, tx);
              const valueExists = await this.variantAttributeValueService.valueExists(attributeId, valueId, tx);
              if (!valueExists) throw CustomError.notFound(errorMessages.variantAttribueValue.notFoundInAttribute);

              const attributeVariantExists = await tx.query.productVariantToValueTable.findFirst({
                where: and(
                  eq(productVariantToValueTable.productVariantId, variantId),
                  eq(productVariantToValueTable.variantAttributeId, attributeId),
                ),
              });

              if (!attributeVariantExists) throw CustomError.notFound(errorMessages.product.attributeNotValid);

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

  softDeleteVariant = async (id: number, variantId: number, userId: string) => {
    await db.transaction(async (tx) => {
      const productDb = await this.getProductbyId(id, tx);
      if (!productDb) throw CustomError.notFound(errorMessages.product.notFoundById);

      const variantExists = productDb.productVariant.find((v) => v.id === variantId);
      if (!variantExists) throw CustomError.notFound(errorMessages.product.invalidVariant);
      if (productDb.productVariant.length === 1)
        throw CustomError.conflict(errorMessages.product.cannotDeleteLastVariant, errorCodes.LAST_VARIANT_CONFLICT);

      await tx
        .update(productVariantTable)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(eq(productVariantTable.id, variantId));
    });

    return true;
  };

  softDelete = async (id: number, userId: string) => {
    await db.transaction(async (tx) => {
      const productDb = await this.getProductbyId(id, tx);
      if (!productDb) throw CustomError.notFound(errorMessages.product.notFoundById);

      const productVariantIds = productDb.productVariant.map((v) => {
        return tx
          .update(productVariantTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productVariantTable.id, v.id));
      });

      await Promise.all([
        ...productVariantIds,
        tx.update(productTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(productTable.id, id)),
      ]);
    });

    return true;
  };
}
