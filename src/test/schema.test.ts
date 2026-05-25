import { describe, expect, it } from 'vitest';
import { updateProductSchema } from '@/modules/product/schemas/product.schema';
import { expectZodError } from './test.utils';

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

describe('UpdateProductSchema', () => {
  describe('Valid Data', () => {
    it('Success data', () => {
      const validData = baseProduct({ variants: [baseVariant()] });
      const result = updateProductSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe('Fail Data', () => {
    it('Missing properties on variants.', () => {
      const validData = {
        variants: [
          {
            variantId: 348,
            price: 12,
            purchasePrice: 49,
          },
        ],
      };
      const result = updateProductSchema.safeParse(validData);
      expect(result.success).toBe(false);
    });

    it('Price and purchasePrice should be number.', () => {
      const validData = baseProduct({
        variants: [baseVariant({ price: '30', purchasePrice: '14' })],
      });
      const result = updateProductSchema.safeParse(validData);
      expect(result.success).toBe(false);
    });

    describe('1. Attributes Consistency', () => {
      it('AttributesId but with only 1 variant.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }],
          variants: [baseVariant({ attributes: [{ attributeId: 1, valueId: 1 }] })],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants');
      });

      it('Missing AttributesId and more than 1 variant.', () => {
        const validData = baseProduct({
          variants: [
            baseVariant({ attributes: [{ attributeId: 1, valueId: 1 }] }),
            baseVariant({ variantId: 101, attributes: [{ attributeId: 1, valueId: 2 }] }),
          ],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'attributesId');
      });
    });

    describe('2. Variants Consistency', () => {
      it('AttributesId but with no variants.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants');
      });

      it('AttributesId but with only 1 variant.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }],
          variants: [baseVariant({ attributes: [{ attributeId: 1, valueId: 1 }] })],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants');
      });

      it('Variant attributes not consistent with AttributesId.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }],
          variants: [
            baseVariant({ attributes: [{ attributeId: 1, valueId: 1 }] }),
            baseVariant({ variantId: 101, attributes: [{ attributeId: 2, valueId: 3 }] }),
          ],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants/attributes/attributeId');
      });

      it('Variants with exact all same attribute and value.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }, { attributeId: 2 }],
          variants: [
            baseVariant({
              attributes: [
                { attributeId: 1, valueId: 1 },
                { attributeId: 2, valueId: 3 },
              ],
            }),
            baseVariant({
              variantId: 101,
              attributes: [
                { attributeId: 1, valueId: 1 },
                { attributeId: 2, valueId: 3 },
              ],
            }),
          ],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants/attributes/attributeId/valueId');
      });

      it('Missing variant attributes according to AttributesId.', () => {
        const validData = baseProduct({
          attributesId: [{ attributeId: 1 }, { attributeId: 2 }],
          variants: [
            baseVariant({ attributes: [{ attributeId: 1, valueId: 1 }] }),
            baseVariant({
              variantId: 101,
              attributes: [
                { attributeId: 1, valueId: 2 },
                { attributeId: 2, valueId: 4 },
              ],
            }),
          ],
        });

        const result = updateProductSchema.safeParse(validData);
        expectZodError(result, 'variants/attributes/attributeId');
      });

      it('Missing variantId and only 1 variant.', () => {
        const validData = baseProduct({
          variants: [baseVariant({}, true)],
        });

        const result = updateProductSchema.safeParse(validData);
        expect(result.success).toBe(false);
        expectZodError(result, 'variants/variantId');
      });
    });
  });
});
