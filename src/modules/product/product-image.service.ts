import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DatabaseError } from 'pg';
import { db, productImagesTable, productTable, productVariantTable, type Transaction } from '@/shared/db';
import { CustomError, errorMessages } from '@/shared/domain';
import { prepareImage } from '@/shared/libs';
import { createObjectStorage, type ObjectStorage } from '@/shared/storage';
import { PRODUCT_IMAGE_LIMITS } from './domain';
import type { OrganizeProductImagesDto } from './schemas/product.schema';

export class ProductImageService {
  private storage?: ObjectStorage;

  constructor(private readonly storageFactory: () => ObjectStorage = createObjectStorage) {}

  private getStorage = () => {
    this.storage ??= this.storageFactory();
    return this.storage;
  };

  private checkVariantExists = async (productId: number, variantId: number, tx?: Transaction) => {
    const query = (tx ?? db)
      .select({ id: productVariantTable.id })
      .from(productVariantTable)
      .innerJoin(productTable, eq(productTable.id, productVariantTable.productId))
      .where(
        and(
          eq(productTable.id, productId),
          eq(productVariantTable.id, variantId),
          isNull(productTable.deletedAt),
          isNull(productVariantTable.deletedAt),
        ),
      );
    const [variant] = await (tx ? query.for('update') : query);
    if (!variant) throw CustomError.notFound(errorMessages.product.invalidVariant);
  };

  private getImages = (variantId: number, tx?: Transaction) =>
    (tx ?? db)
      .select({
        id: productImagesTable.id,
        imageUrl: productImagesTable.imageUrl,
        position: productImagesTable.position,
        isPrimary: productImagesTable.isPrimary,
      })
      .from(productImagesTable)
      .where(eq(productImagesTable.productVariantId, variantId))
      .orderBy(asc(productImagesTable.position));

  private translateDatabaseError = (error: unknown): never => {
    const cause = error instanceof DrizzleQueryError ? error.cause : error;
    if (cause instanceof DatabaseError && ['23505', '23514', '40001', '40P01'].includes(cause.code ?? '')) {
      throw CustomError.conflict(errorMessages.product.imageConstraintConflict);
    }
    throw error;
  };

  upload = async (productId: number, variantId: number, file: Buffer, userId: string) => {
    if (file.length === 0) throw CustomError.badRequest(errorMessages.product.invalidImage);
    if (file.length > PRODUCT_IMAGE_LIMITS.maxFileSize) {
      throw new CustomError({ statusCode: 413, message: errorMessages.product.imageTooLarge });
    }
    await this.checkVariantExists(productId, variantId);
    if ((await this.getImages(variantId)).length >= PRODUCT_IMAGE_LIMITS.maxImages) {
      throw CustomError.conflict(errorMessages.product.imageLimitReached);
    }
    const storage = this.getStorage();
    let body: Buffer;
    try {
      body = await prepareImage(file, PRODUCT_IMAGE_LIMITS);
    } catch {
      throw CustomError.badRequest(errorMessages.product.invalidImage);
    }
    const id = randomUUID();
    const key = `products/variants/${variantId}/${id}.webp`;
    const imageUrl = storage.getPublicUrl(key);
    try {
      await storage.upload({ key, body, contentType: 'image/webp' });
    } catch (error) {
      console.error('Image upload failed; check object for cleanup', { key });
      throw CustomError.internalServer(
        errorMessages.product.imageStorageFailed,
        error instanceof Error ? error : undefined,
      );
    }
    try {
      return await db.transaction(async (tx) => {
        await this.checkVariantExists(productId, variantId, tx);
        const images = await this.getImages(variantId, tx);
        if (images.length >= PRODUCT_IMAGE_LIMITS.maxImages) {
          throw CustomError.conflict(errorMessages.product.imageLimitReached);
        }
        const position = (images.at(-1)?.position ?? 0) + 1;
        if (position > 2147483647) throw CustomError.conflict(errorMessages.product.imageConstraintConflict);
        const [image] = await tx
          .insert(productImagesTable)
          .values({
            id,
            productVariantId: variantId,
            imageUrl,
            storageKey: key,
            position,
            isPrimary: images.length === 0,
            createdBy: userId,
          })
          .returning({
            id: productImagesTable.id,
            imageUrl: productImagesTable.imageUrl,
            position: productImagesTable.position,
            isPrimary: productImagesTable.isPrimary,
          });
        return image;
      });
    } catch (error) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;
      const confirmedRollback =
        error instanceof CustomError || (cause instanceof DatabaseError && /^(23|40)/.test(cause.code ?? ''));
      if (confirmedRollback) {
        try {
          await storage.delete(key);
        } catch {
          console.error('Image cleanup required', { key, imageId: id });
        }
      } else {
        console.error('Image transaction outcome uncertain; reconcile before deleting object', { key, imageId: id });
      }
      this.translateDatabaseError(error);
    }
  };

  organize = async (productId: number, variantId: number, dto: OrganizeProductImagesDto) => {
    try {
      return await db.transaction(async (tx) => {
        await this.checkVariantExists(productId, variantId, tx);
        const images = await this.getImages(variantId, tx);
        const currentIds = new Set(images.map((image) => image.id));
        if (
          dto.imageIds.length !== images.length ||
          new Set(dto.imageIds).size !== images.length ||
          dto.imageIds.some((id) => !currentIds.has(id)) ||
          !currentIds.has(dto.primaryImageId)
        ) {
          throw CustomError.conflict(errorMessages.product.imageOrganizationConflict);
        }
        const occupiedPositions = new Set(images.map((image) => image.position));
        let temporaryPosition = images.length + 1;
        for (const image of images) {
          while (occupiedPositions.has(temporaryPosition)) temporaryPosition++;
          await tx
            .update(productImagesTable)
            .set({ position: temporaryPosition, isPrimary: false })
            .where(eq(productImagesTable.id, image.id));
          occupiedPositions.add(temporaryPosition++);
        }
        for (const [index, id] of dto.imageIds.entries()) {
          await tx
            .update(productImagesTable)
            .set({ position: index + 1, isPrimary: id === dto.primaryImageId })
            .where(eq(productImagesTable.id, id));
        }
        return this.getImages(variantId, tx);
      });
    } catch (error) {
      this.translateDatabaseError(error);
    }
  };
}
