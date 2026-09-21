import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT_IMAGE_LIMITS, PRODUCT_IMAGE_STORAGE_PATH } from '@/modules/product/domain';
import { ProductImageService } from '@/modules/product/product-image.service';
import { db, productImagesTable, productVariantTable } from '@/shared/db';
import { errorMessages } from '@/shared/domain';
import type { ObjectStorage } from '@/shared/storage';
import { createFixture, type ProductFixture, productService } from './fixtures';

let fixture: ProductFixture;
let productId: number;
let variantId: number;
let png: Buffer;
let images: ProductImageService;
let storage: ObjectStorage;

beforeAll(async () => {
  png = await sharp({ create: { width: 20, height: 10, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
});
beforeEach(async () => {
  fixture = await createFixture();
  const product = await productService.create(fixture.dto, fixture.user.id);
  productId = Number(product.id);
  const variant = await db.query.productVariantTable.findFirst({ where: eq(productVariantTable.productId, productId) });
  if (!variant) throw new Error('Falta la variante');
  variantId = variant.id;
  storage = {
    upload: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    getPublicUrl: (key) => `https://images.example.test/${key}`,
  };
  images = new ProductImageService(() => storage);
});

const storedImages = () =>
  db.select().from(productImagesTable).where(eq(productImagesTable.productVariantId, variantId));
const upload = () => images.upload(productId, variantId, png, fixture.user.id);

describe('imágenes de variantes', () => {
  it('convierte PNG a WebP, persiste la key y marca solo la primera como principal', async () => {
    const first = await upload();
    const second = await upload();
    expect(first).toMatchObject({ position: 1, isPrimary: true });
    expect(second).toMatchObject({ position: 2, isPrimary: false });
    const call = vi.mocked(storage.upload).mock.calls[0][0];
    expect(call.key).toBe(`${PRODUCT_IMAGE_STORAGE_PATH}/${variantId}/${first?.id}.webp`);
    expect(call.contentType).toBe('image/webp');
    expect((await sharp(call.body).metadata()).format).toBe('webp');
    expect(await storedImages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first?.id, storageKey: call.key, createdBy: fixture.user.id }),
      ]),
    );
  });

  it('reordena imágenes y cambia la principal respetando los índices únicos', async () => {
    const first = await upload();
    const second = await upload();
    if (!first || !second) throw new Error('Faltan imágenes');
    const result = await images.organize(productId, variantId, {
      imageIds: [second.id, first.id],
      primaryImageId: second.id,
    });
    expect(result).toEqual([
      { ...second, position: 1, isPrimary: true },
      { ...first, position: 2, isPrimary: false },
    ]);
    expect((await productService.getByIdentifier(productId)).productVariant).toEqual([
      expect.objectContaining({ images: result }),
    ]);
  });

  it('rechaza una lista incompleta sin cambiar las posiciones', async () => {
    const first = await upload();
    await upload();
    if (!first) throw new Error('Falta imagen');
    const before = await storedImages();
    await expect(
      images.organize(productId, variantId, { imageIds: [first.id], primaryImageId: first.id }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await storedImages()).toEqual(before);
  });

  it.each([
    ['vacío', Buffer.alloc(0), 400],
    ['demasiado grande', Buffer.alloc(PRODUCT_IMAGE_LIMITS.maxFileSize + 1), 413],
    ['contenido inválido', Buffer.from('esto no es una imagen'), 400],
  ])('rechaza archivo %s antes de subirlo', async (_name, body, statusCode) => {
    await expect(images.upload(productId, variantId, body, fixture.user.id)).rejects.toMatchObject({ statusCode });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(await storedImages()).toEqual([]);
  });

  it('rechaza variantes ajenas o eliminadas', async () => {
    await expect(images.upload(-1, variantId, png, fixture.user.id)).rejects.toMatchObject({ statusCode: 404 });
    await productService.softDelete(productId, fixture.user.id);
    await expect(upload()).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rechaza la undécima imagen sin subir un objeto adicional', async () => {
    for (let index = 0; index < PRODUCT_IMAGE_LIMITS.maxImages; index++) await upload();
    await expect(upload()).rejects.toMatchObject({ statusCode: 409, message: errorMessages.product.imageLimitReached });
    expect(storage.upload).toHaveBeenCalledTimes(PRODUCT_IMAGE_LIMITS.maxImages);
    expect(await storedImages()).toHaveLength(PRODUCT_IMAGE_LIMITS.maxImages);
  });

  it('no persiste una imagen cuando falla el almacenamiento', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(storage.upload).mockRejectedValueOnce(new Error('S3 no disponible'));
    await expect(upload()).rejects.toMatchObject({
      statusCode: 500,
      message: errorMessages.product.imageStorageFailed,
    });
    expect(await storedImages()).toEqual([]);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('elimina el objeto subido si la variante se elimina antes de confirmar la imagen', async () => {
    vi.mocked(storage.upload).mockImplementationOnce(async () => {
      await productService.softDelete(productId, fixture.user.id);
    });
    await expect(upload()).rejects.toMatchObject({ statusCode: 404 });
    expect(storage.delete).toHaveBeenCalledWith(vi.mocked(storage.upload).mock.calls[0][0].key);
    expect(await storedImages()).toEqual([]);
  });
});
