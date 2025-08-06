import { db } from '../../db';
import { categoryTable, productImagesTable, productTable } from '../../db/schemas';
import { seedData } from './seed.data';

export class SeedService {
  execute = async () => {
    const { categories, products, productsImages } = seedData;

    const productsToInsert = products.map((product) => {
      return {
        ...product,
        price: product.price.toFixed(6),
      };
    });

    try {
      // Delete all
      await Promise.all([db.delete(categoryTable), db.delete(productTable), db.delete(productImagesTable)]);
      await Promise.all([db.delete(productImagesTable)]);

      await db.insert(categoryTable).values(categories);
      await db.insert(productTable).values(productsToInsert);
      await db.insert(productImagesTable).values(productsImages);

      return 'executed';
    } catch (error) {
      console.log(error);
    }
  };
}
