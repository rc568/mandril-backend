import { db } from '../../db';
import {
  catalogTable,
  categoryTable,
  productImagesTable,
  productTable,
  productToVariantAttributeTable,
  productVariantTable,
  productVariantToValueTable,
  variantAttributeTable,
  variantAttributeValueTable,
} from '../../db/schemas';
import { seedData } from './seed.data';

export class SeedService {
  execute = async () => {
    const {
      catalog,
      category,
      product,
      productImages,
      productVariant,
      productToVariantAttribute,
      productVariantToValue,
      variantAttribute,
      variantAttributeValue,
    } = seedData;

    const productsVariantToInsert = productVariant.map((variant) => {
      return {
        ...variant,
        price: variant.price.toFixed(6),
        purchasePrice: variant.purchasePrice.toFixed(6),
      };
    });

    await db.transaction(async (tx) => {
      // Delete all
      await Promise.all([
        tx.delete(productImagesTable),
        tx.delete(productVariantTable),
        tx.delete(productTable),
        tx.delete(categoryTable),
        tx.delete(catalogTable),
        tx.delete(variantAttributeTable),
        tx.delete(variantAttributeValueTable),
        tx.delete(productToVariantAttributeTable),
        tx.delete(productVariantToValueTable),
      ]);

      await Promise.all([
        tx.insert(catalogTable).values(catalog),
        tx.insert(categoryTable).values(category),
        tx.insert(variantAttributeTable).values(variantAttribute),
      ]);

      await tx.insert(productTable).values(product);
      await tx.insert(productVariantTable).values(productsVariantToInsert);
      await tx.insert(productImagesTable).values(productImages);
      await tx.insert(variantAttributeValueTable).values(variantAttributeValue);
      await tx.insert(productToVariantAttributeTable).values(productToVariantAttribute);
      await tx.insert(productVariantToValueTable).values(productVariantToValue);
    });

    return 'executed';
  };
}
