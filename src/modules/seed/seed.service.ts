import {
  catalogTable,
  categoryTable,
  clientTable,
  db,
  orderProductTable,
  orderTable,
  productImagesTable,
  productTable,
  productToVariantAttributeTable,
  productVariantTable,
  productVariantToValueTable,
  salesChannelTable,
  skuCounterTable,
  variantAttributeTable,
  variantAttributeValueTable,
} from '@/shared/db';
import { seedData } from './seed.data';

export class SeedService {
  execute = async (userId: string) => {
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
      skuCounter,
      salesChannel,
      client,
      order,
      orderProducts,
    } = seedData;

    const CHUNK_SIZE = 500;

    const productsVariantToInsert = productVariant.map((variant) => {
      return {
        ...variant,
        price: variant.price.toFixed(6),
        purchasePrice: variant.purchasePrice.toFixed(6),
      };
    });

    const productImagesToInsert = productImages.map((image) => {
      const match = image.imageUrl.match(/\/([0-9]+)\.[a-zA-Z0-9]+(?:[?#].*)?$/);
      const position = match ? Number(match[1]) : NaN;
      if (!Number.isInteger(position) || position < 1 || position > 2147483647) {
        throw new Error(`La imagen del seed no tiene una posición válida: ${image.imageUrl}`);
      }

      return { ...image, position, isPrimary: position === 1, createdBy: userId };
    });

    const orderProductsToInsert = orderProducts.map((op) => {
      return {
        ...op,
        price: op.price.toFixed(6),
        purchasePrice: op.purchasePrice.toFixed(6),
      };
    });

    const orderToInsert = order.map((o) => {
      return {
        ...o,
        createdAt: new Date(o.createdAt),
        createdBy: userId,
      };
    });

    await db.transaction(async (tx) => {
      // Delete all
      await tx.delete(skuCounterTable);
      await tx.delete(productVariantToValueTable);
      await tx.delete(productToVariantAttributeTable);
      await tx.delete(variantAttributeTable);
      await tx.delete(variantAttributeValueTable);
      await tx.delete(orderProductTable);
      await tx.delete(productImagesTable);
      await tx.delete(productVariantTable);
      await tx.delete(productTable);
      await tx.delete(categoryTable);
      await tx.delete(catalogTable);
      await tx.delete(orderTable);
      await tx.delete(clientTable);
      await tx.delete(salesChannelTable);

      await Promise.all([
        tx.insert(skuCounterTable).values(skuCounter),
        tx.insert(catalogTable).values(catalog.map((c) => ({ ...c, createdBy: userId }))),
        tx.insert(categoryTable).values(category.map((c) => ({ ...c, createdBy: userId }))),
        tx.insert(variantAttributeTable).values(variantAttribute),
        tx.insert(salesChannelTable).values(salesChannel.map((c) => ({ ...c, createdBy: userId }))),
      ]);

      await tx.insert(productTable).values(product.map((p) => ({ ...p, createdBy: userId })));
      await tx.insert(productVariantTable).values(productsVariantToInsert.map((p) => ({ ...p, createdBy: userId })));
      await tx.insert(productImagesTable).values(productImagesToInsert);
      await tx.insert(variantAttributeValueTable).values(variantAttributeValue);
      await tx.insert(productToVariantAttributeTable).values(productToVariantAttribute);
      await tx.insert(productVariantToValueTable).values(productVariantToValue);

      for (let i = 0; i * CHUNK_SIZE < client.length; i++) {
        const chunk = client.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await tx.insert(clientTable).values(chunk);
      }

      for (let i = 0; i * CHUNK_SIZE < orderToInsert.length; i++) {
        const chunk = orderToInsert.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await tx.insert(orderTable).values(chunk);
      }

      await tx.insert(orderProductTable).values(orderProductsToInsert);
    });

    return 'executed';
  };
}
