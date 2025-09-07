import { eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  catalogTable,
  categoryTable,
  productImagesTable,
  productTable,
  productVariantTable,
  variantAttributeMapTable,
  variantAttributeTable,
  variantAttributeValuesTable,
} from '../../db/schemas';
import { CustomError } from '../../domain/errors/custom.error';
import { seedData } from './seed.data';

export class SeedService {
  execute = async () => {
    const {
      catalog,
      category,
      product,
      productImages,
      productVariant,
      optionValue,
      productOptions,
      variantOptionValues,
    } = seedData;

    const productsVariantToInsert = productVariant.map((variant) => {
      return {
        ...variant,
        price: variant.price.toFixed(6),
        purchasePrice: variant.purchasePrice.toFixed(6),
      };
    });

    const variantOptionsValuesToInsert = await Promise.all(
      variantOptionValues.map(async (val) => {
        const productVariantId = await db.query.productVariantTable.findFirst({
          where: eq(productVariantTable.code, val.productVariantCode),
          columns: { id: true },
        });

        if (!productVariantId)
          throw CustomError.notFound(
            `Code ${val.productVariantCode} not found on product variant.`,
          );

        return {
          variantValueId: val.optionValueId,
          productVariantId: productVariantId.id,
        };
      }),
    );

    try {
      // Delete all
      await Promise.all([
        db.delete(productImagesTable),
        db.delete(productVariantTable),
        db.delete(productTable),
        db.delete(categoryTable),
        db.delete(catalogTable),
        db.delete(variantAttributeTable),
        db.delete(variantAttributeValuesTable),
        db.delete(variantAttributeMapTable),
      ]);

      await Promise.all([
        db.insert(catalogTable).values(catalog),
        db.insert(categoryTable).values(category),
        db.insert(variantAttributeTable).values(productOptions),
        db.insert(variantAttributeValuesTable).values(optionValue),
      ]);

      await db.insert(productTable).values(product);
      await db.insert(productVariantTable).values(productsVariantToInsert);
      await db.insert(productImagesTable).values(productImages);
      await db.insert(variantAttributeMapTable).values(variantOptionsValuesToInsert);

      return 'executed';
    } catch (error) {
      console.log(error);
    }
  };
}
