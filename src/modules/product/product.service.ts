import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseError } from 'pg';
import type { CatalogService } from '@/modules/catalog';
import type { CategoryService } from '@/modules/category';
import type { SkuCounterService } from '@/modules/sku-counter';
import type { VariantAttributeService, VariantAttributeValueService } from '@/modules/variant-attribute';
import {
  db,
  productTable,
  productToVariantAttributeTable,
  productVariantTable,
  productVariantToValueTable,
  type Transaction,
} from '@/shared/db';
import {
  CustomError,
  DEFAULT_LIMIT,
  DEFAULT_OFFSET,
  DEFAULT_PAGE,
  errorCodes,
  errorMessages,
  PAGINATION_LIMITS,
} from '@/shared/domain';
import { calculatePagination, normalizeArray } from '@/shared/utils';
import { DEFAULT_LIMIT_SEARCH_VARIANTS, PAGINATION_LIMITS_SEARCH_VARIANTS, VARIANT_PREFIX } from './domain';

import { resumeProductsQuery, searchProductsQuery, searchProductVariantsQuery } from './queries';
import type {
  BaseProductVariantDto,
  GetProductsQuery,
  GetSearchProductVariantsQuery,
  ProductAttributesDto,
  ProductCreateDto,
  ProductGeneralInfoDto,
  ProductUpdateDto,
  UpdateProductVariantDto,
  VariantAttributeDto,
} from './schemas/product.schema';

export class ProductService {
  constructor(
    private readonly categoryService: CategoryService,
    private readonly catalogService: CatalogService,
    private readonly variantAttributeService: VariantAttributeService,
    private readonly variantAttributeValueService: VariantAttributeValueService,
    private readonly skuCounterService: SkuCounterService,
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

  private updateProductGeneralInfo = async (
    productId: number,
    productGeneralInfoDto: Partial<ProductGeneralInfoDto>,
    userId: string,
    tx?: Transaction,
  ) => {
    const executor = tx ?? db;

    if (productGeneralInfoDto.slug && (await this.slugExists(productGeneralInfoDto.slug, tx))) {
      throw CustomError.conflict(errorMessages.product.slugExists);
    }

    if (productGeneralInfoDto.categoryId) {
      await this.categoryService.getById(productGeneralInfoDto.categoryId, tx);
    }

    if (productGeneralInfoDto.catalogId) {
      await this.catalogService.getById(productGeneralInfoDto.catalogId, tx);
    }

    if (
      productGeneralInfoDto.name ||
      productGeneralInfoDto.slug ||
      productGeneralInfoDto.description ||
      productGeneralInfoDto.categoryId ||
      productGeneralInfoDto.catalogId ||
      productGeneralInfoDto.isActive !== undefined
    ) {
      await executor
        .update(productTable)
        .set({ ...productGeneralInfoDto, updatedBy: userId })
        .where(eq(productTable.id, productId));
    }
  };

  private validateAttributeTransitions = async (productId: number, force: boolean, tx: Transaction) => {
    if (!force) {
      throw CustomError.conflict(
        errorMessages.product.deleteCurrenteAttributesNotAllowed,
        errorCodes.PRODUCT_WILL_BECOME_WITHOUT_ATTRIBUTES,
      );
    }

    await tx.delete(productToVariantAttributeTable).where(eq(productToVariantAttributeTable.productId, productId));
  };

  private checkVariantConflicts = async (
    productId: number,
    variantsDto: UpdateProductVariantDto[],
    tx: Transaction,
  ) => {
    if (variantsDto.length === 0) return;

    const allExistingVariants = (
      await tx.query.productVariantTable.findMany({
        columns: { id: true, deletedAt: true },
        where: eq(productVariantTable.productId, productId),
        with: { variantValues: { columns: { variantAttributeId: true, variantAttributeValueId: true } } },
      })
    ).map((v) => ({
      variantId: v.id,
      deletedAt: v.deletedAt,
      attributes: v.variantValues.map((a) => ({
        attributeId: a.variantAttributeId,
        valueId: a.variantAttributeValueId,
      })),
    }));

    const allCurrentVariantsId = allExistingVariants.map((v) => v.variantId);

    for (const variantDto of variantsDto) {
      if (variantDto.attributes && variantDto.attributes.length > 0) {
        const match = allExistingVariants.find((variantDb) => {
          return normalizeArray(variantDb.attributes) === normalizeArray(variantDto.attributes ?? []);
        });

        if (match) {
          if (match.variantId === variantDto.variantId) {
            if (match.deletedAt) {
              await tx
                .update(productVariantTable)
                .set({ deletedAt: null, deletedBy: null })
                .where(eq(productVariantTable.id, variantDto.variantId));
            }
            continue;
          }

          if (!match.deletedAt) {
            throw CustomError.conflict(errorMessages.product.activeVariantWithSameAttributesExists(match.variantId));
          }

          if (match.deletedAt) {
            throw CustomError.conflict(errorMessages.product.deletedVariantWithSameAttributesExists(match.variantId));
          }
        }
      }

      if (!variantDto.variantId) continue;

      if (!allCurrentVariantsId.includes(variantDto.variantId)) {
        throw CustomError.notFound(errorMessages.product.invalidVariant);
      }
    }
  };

  private syncProductAttributes = async (
    productId: number,
    attributesIdDto: ProductAttributesDto,
    tx?: Transaction,
  ): Promise<void> => {
    if (attributesIdDto.length === 0) return;

    const executor = tx ?? db;

    const attributeIds = attributesIdDto.map((a) => a.attributeId);
    await Promise.all(attributeIds.map((id) => this.variantAttributeService.getById(id, tx)));

    await Promise.all([
      executor
        .delete(productToVariantAttributeTable)
        .where(and(eq(productToVariantAttributeTable.productId, productId))),
      ...attributeIds.map((id) =>
        executor.insert(productToVariantAttributeTable).values({
          productId: productId,
          variantAttributeId: id,
        }),
      ),
    ]);
  };

  private syncProductVariants = async (
    productId: number,
    variantsDto: UpdateProductVariantDto[],
    currentVariantsId: number[],
    userId: string,
    tx: Transaction,
  ) => {
    const variantsIdDto = variantsDto.map((v) => v.variantId).filter((id) => id !== undefined);
    const variantsIdToDelete = currentVariantsId.filter((id) => !variantsIdDto.includes(id));

    if (variantsIdToDelete.length > 0) {
      await tx
        .update(productVariantTable)
        .set({ deletedAt: new Date(), deletedBy: userId })
        .where(inArray(productVariantTable.id, variantsIdToDelete));
    }

    const promisesToResolve = [];
    for (const variantDto of variantsDto) {
      if (!variantDto.variantId) {
        promisesToResolve.push(...(await this.createVariantPromises(productId, variantDto, userId, tx)));
      } else {
        promisesToResolve.push(...(await this.updateVariantPromises(variantDto.variantId, variantDto, userId, tx)));
      }
    }

    await Promise.all(promisesToResolve);
  };

  private createVariantPromises = async (
    productId: number,
    variant: BaseProductVariantDto,
    userId: string,
    tx: Transaction,
  ) => {
    const { attributes, ...productVariant } = variant;
    const addAttributePromises = [];

    const newCode = await this.skuCounterService.create(VARIANT_PREFIX, tx);

    const [newVariantId] = await tx
      .insert(productVariantTable)
      .values({ ...productVariant, productId: productId, code: newCode, createdBy: userId })
      .returning({ id: productVariantTable.id });

    if (attributes) {
      for (const attribute of attributes) {
        addAttributePromises.push(...(await this.addAttributeValueToVariantPromises(attribute, newVariantId.id, tx)));
      }
    }

    return addAttributePromises;
  };

  private updateVariantPromises = async (
    variantId: number,
    variantDto: BaseProductVariantDto,
    userId: string,
    tx: Transaction,
  ) => {
    const promisesToResolve = [];

    if (
      variantDto.price ||
      variantDto.purchasePrice ||
      variantDto.quantityInStock ||
      variantDto.isActive !== undefined
    ) {
      promisesToResolve.push(
        tx
          .update(productVariantTable)
          .set({ ...variantDto, updatedBy: userId })
          .where(eq(productVariantTable.id, variantId)),
      );
    }

    await tx.delete(productVariantToValueTable).where(eq(productVariantToValueTable.productVariantId, variantId));

    if (variantDto.attributes) {
      for (const attributeDto of variantDto.attributes) {
        promisesToResolve.push(...(await this.addAttributeValueToVariantPromises(attributeDto, variantId, tx)));
      }
    }

    return promisesToResolve;
  };

  private addAttributeValueToVariantPromises = async (
    variantAttribute: VariantAttributeDto,
    variantId: number,
    tx: Transaction,
  ) => {
    const promisesToResolve = [];

    const valueExists = await this.variantAttributeValueService.valueExists(
      variantAttribute.attributeId,
      variantAttribute.valueId,
      tx,
    );
    if (!valueExists) throw CustomError.notFound(errorMessages.variantAttribueValue.notFoundInAttribute);

    promisesToResolve.push(
      tx.insert(productVariantToValueTable).values({
        productVariantId: variantId,
        variantAttributeValueId: variantAttribute.valueId,
        variantAttributeId: variantAttribute.attributeId,
      }),
    );

    return promisesToResolve;
  };

  getVariantByIdForUpdate = async (id: number, tx?: Transaction) => {
    const executor = tx ?? db;
    const variant = await executor
      .select({
        code: productVariantTable.code,
        id: productVariantTable.id,
        price: productVariantTable.price,
        productId: productVariantTable.productId,
        quantityInStock: productVariantTable.quantityInStock,
        purchasePrice: productVariantTable.purchasePrice,
      })
      .from(productVariantTable)
      .where(and(eq(productVariantTable.id, id), isNull(productVariantTable.deletedAt)))
      .for('update');

    return variant[0];
  };

  getAll = async ({
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
    maxPrice,
    minPrice,
    orderBy,
    catalogId,
    categoryId,
    isActive,
    search,
  }: GetProductsQuery) => {
    let newLimit = limit;
    if (!PAGINATION_LIMITS.includes(limit as any)) newLimit = DEFAULT_LIMIT;

    const totalResult = await db.execute(
      resumeProductsQuery({ catalogId, categoryId, isActive, maxPrice, minPrice, search }),
    );
    const totalItems = (totalResult.rows[0] as { totalProducts: string }).totalProducts;

    const pagination = calculatePagination(parseInt(totalItems), page, newLimit);
    if (pagination.totalItems === 0) {
      return {
        pagination,
        products: [],
      };
    }

    const { rows: products } = await db.execute(
      searchProductsQuery({
        limit: newLimit,
        offset: (page - 1) * newLimit,
        orderBy: orderBy,
        catalogId,
        categoryId,
        isActive,
        maxPrice,
        minPrice,
        search,
      }),
    );

    return {
      pagination,
      products,
    };
  };

  getSearchProductVariants = async ({
    limit = DEFAULT_LIMIT_SEARCH_VARIANTS,
    offset = DEFAULT_OFFSET,
    search,
  }: GetSearchProductVariantsQuery) => {
    let normalizeLimit = limit;
    if (!PAGINATION_LIMITS_SEARCH_VARIANTS.includes(normalizeLimit as any))
      normalizeLimit = DEFAULT_LIMIT_SEARCH_VARIANTS;

    const { rows: products } = await db.execute(
      searchProductVariantsQuery({ limit: normalizeLimit + 1, offset, search }),
    );

    const hasNextPage = products.length > normalizeLimit;
    const items = hasNextPage ? products.slice(0, normalizeLimit) : products;

    return {
      products: items,
      pagination: {
        limit: normalizeLimit,
        nextOffset: hasNextPage ? offset + normalizeLimit : null,
      },
    };
  };

  getByIdentifier = async (identifier: string | number, tx?: Transaction) => {
    const executor = tx ?? db;
    const isSlug = typeof identifier === 'string';

    const { rows: product } = await executor.execute(searchProductsQuery({ productIdentifier: identifier }));

    if (product.length === 0) {
      const message = isSlug ? errorMessages.product.notFoundBySlug : errorMessages.product.notFoundById;
      throw CustomError.notFound(message);
    }

    return product[0];
  };

  create = async (productDto: ProductCreateDto, userId: string) => {
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

        const promisesToResolve = [];
        for (const variant of variants) {
          promisesToResolve.push(...(await this.createVariantPromises(newProductId, variant, userId, tx)));
        }
        await Promise.all(promisesToResolve);

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

  update = async (productId: number, productUpdateDto: ProductUpdateDto, force: boolean = false, userId: string) => {
    const updateProduct = await db.transaction(async (tx) => {
      const productDb = await this.getProductbyId(productId, tx);
      if (!productDb) throw CustomError.notFound(errorMessages.product.notFoundById);

      const { variants: variantsDto, attributesId: attributesIdDto, ...restDto } = productUpdateDto;
      const currentVariantsIdNotDeleted = productDb.productVariant.map((pv) => pv.id);
      const willProductBecomeWithoutAttributes = productDb.attributes.length > 0 && !attributesIdDto;

      if (willProductBecomeWithoutAttributes) await this.validateAttributeTransitions(productId, force, tx);

      if (variantsDto) await this.checkVariantConflicts(productId, variantsDto, tx);

      if (attributesIdDto) await this.syncProductAttributes(productId, attributesIdDto, tx);

      await this.updateProductGeneralInfo(productId, restDto, userId, tx);

      if (variantsDto) {
        await this.syncProductVariants(productId, variantsDto, currentVariantsIdNotDeleted, userId, tx);
      }

      return this.getByIdentifier(productId, tx);
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

      await Promise.all([
        tx
          .update(productVariantTable)
          .set({ deletedAt: new Date(), deletedBy: userId })
          .where(eq(productVariantTable.productId, id)),
        tx.update(productTable).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(productTable.id, id)),
      ]);
    });

    return true;
  };

  addStockForOrder = async (items: { variantId: number; stockToAdd: number }, userId: string, tx?: Transaction) => {
    const executor = tx ?? db;

    const variantDb = await this.getVariantByIdForUpdate(items.variantId, tx);
    if (!variantDb) throw CustomError.notFound(errorMessages.product.variantNotFoundById);

    if (variantDb.quantityInStock + items.stockToAdd < 0) {
      throw CustomError.conflict(errorMessages.order.outOfStock);
    }

    await executor
      .update(productVariantTable)
      .set({ quantityInStock: variantDb.quantityInStock + items.stockToAdd, updatedBy: userId })
      .where(eq(productVariantTable.id, items.variantId));
  };
}
