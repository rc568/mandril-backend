import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductService } from '@/modules/product';
import { updateProductSchema } from '@/modules/product/schemas/product.schema';
import { errorMessages } from '@/shared/domain';

const baseVariant = (overrides = {}, missVariantId = false) => ({
  ...(missVariantId ? {} : { variantId: 100 }),
  price: 25,
  purchasePrice: 12,
  quantityInStock: 10,
  ...overrides,
});

const baseProduct = (overrides = {}) => ({
  isActive: true,
  catalogId: 5,
  description: 'Producto de prueba',
  variants: [baseVariant()],
  ...overrides,
});

describe('ProductService', () => {
  const mockCategoryService = { getById: vi.fn() };
  const mockCatalogService = { getById: vi.fn() };
  const mockVariantAttributeService = { getById: vi.fn() };
  const mockVariantAttributeValueService = { valueExists: vi.fn() };
  const mockSkuCounterService = { create: vi.fn() };

  const productService = new ProductService(
    mockCategoryService as any,
    mockCatalogService as any,
    mockVariantAttributeService as any,
    mockVariantAttributeValueService as any,
    mockSkuCounterService as any,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw an error if product does not exist', async () => {
    await expect(productService.getByIdentifier(600)).rejects.toThrow(errorMessages.product.notFoundById);
  });

  it('Duplicated Slug.', async () => {
    const product = baseProduct({
      slug: 'iphone-14-pro',
    });

    const { data, success } = updateProductSchema.safeParse(product);
    if (!success) {
      expect(success).toBe(true);
      return;
    }

    await expect(productService.update(377, data, 'user')).rejects.toThrow(errorMessages.product.slugExists);
  });

  it('CategoryId doesnt exists.', async () => {
    const product = baseProduct({
      attributesId: [{ attributeId: 1 }, { attributeId: 2 }],
      variants: [
        baseVariant({
          attributes: [
            { attributeId: 1, valueId: 1 },
            { attributeId: 2, valueId: 10 },
          ],
        }),
        baseVariant({
          variantId: 101,
          attributes: [
            { attributeId: 1, valueId: 2 },
            { attributeId: 2, valueId: 4 },
          ],
        }),
      ],
    });

    const { data, success } = updateProductSchema.safeParse(product);
    if (!success) {
      expect(success).toBe(true);
      return;
    }

    await expect(productService.update(377, data, 'user')).rejects.toThrow(errorMessages.category.notFound);
  });
});
