import { describe, expect, it } from 'vitest';
import { createProductSchema, updateProductSchema } from '@/modules/product/schemas/product.schema';
import { errorMessages } from '@/shared/domain';

const product = () => ({
  name: 'Polo',
  slug: 'polo',
  categoryId: 1,
  catalogId: 1,
  attributesId: [{ attributeId: 1 }, { attributeId: 2 }],
  variants: [
    {
      price: 50,
      purchasePrice: 30,
      quantityInStock: 2,
      attributes: [
        { attributeId: 1, valueId: 1 },
        { attributeId: 2, valueId: 3 },
      ],
    },
    {
      price: 50,
      purchasePrice: 30,
      quantityInStock: 2,
      attributes: [
        { attributeId: 1, valueId: 2 },
        { attributeId: 2, valueId: 3 },
      ],
    },
  ],
});

describe('combinaciones de atributos', () => {
  it('acepta dos variantes con combinaciones distintas', () => {
    expect(createProductSchema.safeParse(product()).success).toBe(true);
  });

  it('rechaza atributos repetidos en el producto', () => {
    const input = product();
    input.attributesId = [{ attributeId: 1 }, { attributeId: 1 }];
    expect(createProductSchema.safeParse(input).error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: errorMessages.product.productAttributesNotUnique })]),
    );
  });

  it('rechaza repetir un atributo dentro de una variante', () => {
    const input = product();
    input.variants[0].attributes = [
      { attributeId: 1, valueId: 1 },
      { attributeId: 1, valueId: 2 },
    ];
    expect(createProductSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza combinaciones duplicadas aunque cambie el orden de atributos', () => {
    const input = product();
    input.variants[1].attributes = [...input.variants[0].attributes].reverse();
    expect(createProductSchema.safeParse(input).error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: errorMessages.product.variantsWithSameAttributesValues }),
      ]),
    );
  });

  it('rechaza una variante que omite un atributo del producto', () => {
    const input = product();
    input.variants[0].attributes.pop();
    expect(createProductSchema.safeParse(input).success).toBe(false);
  });

  it('rechaza atributos cuando solo hay una variante', () => {
    const input = product();
    input.variants.pop();
    expect(createProductSchema.safeParse(input).success).toBe(false);
  });

  it('exige las variantes cuando se actualizan atributos', () => {
    expect(updateProductSchema.safeParse({ attributesId: [{ attributeId: 1 }] }).success).toBe(false);
  });

  it('rechaza actualizar dos veces la misma variante', () => {
    const input = product();
    expect(
      updateProductSchema.safeParse({
        ...input,
        variants: input.variants.map((variant) => ({ ...variant, isActive: true, variantId: 10 })),
      }).success,
    ).toBe(false);
  });

  it('impide agregar una variante nueva a un producto sin atributos', () => {
    expect(
      updateProductSchema.safeParse({
        variants: [{ price: 50, purchasePrice: 30, quantityInStock: 2, isActive: true }],
      }).success,
    ).toBe(false);
  });
});
