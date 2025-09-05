import { db } from '../../db';
import { catalogTable, categoryTable, productImagesTable, productTable, productVariantTable } from '../../db/schemas';
import { seedData } from './seed.data';

export class SeedService {
  execute = async () => {
    const { catalog, category, product, productImages, productVariant } = seedData;

    const productsVariantToInsert = productVariant.map((variant) => {
      return {
        ...variant,
        price: variant.price.toFixed(6),
        purchasePrice: variant.purchasePrice.toFixed(6),
      };
    });

    try {
      // Delete all
      await Promise.all([
        db.delete(productImagesTable),
        db.delete(productVariantTable),
        db.delete(productTable),
        db.delete(categoryTable),
        db.delete(catalogTable),
      ]);

      await db.insert(catalogTable).values(catalog);
      await db.insert(categoryTable).values(category);
      await db.insert(productTable).values(product);
      await db.insert(productVariantTable).values(productsVariantToInsert);
      await db.insert(productImagesTable).values(productImages);

      return 'executed';
    } catch (error) {
      console.log(error);
    }
  };
}
