import { describe, expect, it } from 'vitest';
import {
  createProductSchema,
  organizeProductImagesSchema,
  updateProductSchema,
} from '@/modules/product/schemas/product.schema';
import { errorMessages } from '@/shared/domain';

const product = () => ({
  name: 'Taladro',
  slug: 'taladro',
  categoryId: 1,
  catalogId: 1,
  variants: [{ price: 100, purchasePrice: 60, quantityInStock: 5 }],
});

describe('datos de un producto', () => {
  it('convierte precios a seis decimales y aplica los valores por defecto', () => {
    const result = createProductSchema.parse(product());
    expect(result.isActive).toBe(true);
    expect(result.variants[0]).toEqual({
      price: '100.000000',
      purchasePrice: '60.000000',
      quantityInStock: 5,
      isActive: true,
    });
  });

  it.each([
    ['precio negativo', { price: -1 }],
    ['precio de compra cero', { purchasePrice: 0 }],
    ['stock negativo', { quantityInStock: -1 }],
    ['stock fraccionario', { quantityInStock: 1.5 }],
    ['garantía negativa', { warrantyMonths: -1 }],
    ['medida cero', { lengthCm: 0 }],
    ['medida con tres decimales', { lengthCm: 1.123 }],
    ['umbral negativo', { stockAlertThreshold: -1 }],
  ])('rechaza %s', (_name, changes) => {
    const input = product();
    expect(createProductSchema.safeParse({ ...input, variants: [{ ...input.variants[0], ...changes }] }).success).toBe(
      false,
    );
  });

  it('requiere al menos una variante', () => {
    expect(createProductSchema.safeParse({ ...product(), variants: [] }).success).toBe(false);
  });

  it('acepta una actualización parcial del nombre', () => {
    expect(updateProductSchema.parse({ name: 'Taladro nuevo' })).toEqual({ name: 'Taladro nuevo' });
  });

  it('rechaza varias variantes sin atributos', () => {
    const input = product();
    const result = createProductSchema.safeParse({ ...input, variants: [input.variants[0], input.variants[0]] });
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: errorMessages.product.productWithoutAttributes })]),
    );
  });
});

describe('ofertas', () => {
  const offer = { offerPrice: 80, offerStartsAt: '2026-01-01T00:00:00Z', offerEndsAt: '2026-02-01T00:00:00Z' };

  it('convierte una oferta válida y las medidas', () => {
    const input = product();
    const result = createProductSchema.parse({
      ...input,
      variants: [{ ...input.variants[0], ...offer, lengthCm: 12.5 }],
    });
    expect(result.variants[0]).toMatchObject({
      offerPrice: '80.000000',
      offerStartsAt: new Date(offer.offerStartsAt),
      lengthCm: '12.50',
    });
  });

  it.each([
    ['precio igual al normal', { offerPrice: 100 }],
    ['fecha final anterior', { offerEndsAt: '2025-01-01T00:00:00Z' }],
    ['fecha final igual', { offerEndsAt: offer.offerStartsAt }],
    ['oferta incompleta', { offerStartsAt: null }],
  ])('rechaza %s', (_name, changes) => {
    const input = product();
    expect(
      createProductSchema.safeParse({ ...input, variants: [{ ...input.variants[0], ...offer, ...changes }] }).success,
    ).toBe(false);
  });

  it('permite omitir la oferta de una variante existente: el servicio valida contra la BD', () => {
    expect(
      updateProductSchema.safeParse({
        variants: [{ ...product().variants[0], variantId: 1, isActive: true, offerPrice: 80 }],
      }).success,
    ).toBe(true);
  });
});

describe('organización de imágenes', () => {
  const first = '11111111-1111-4111-8111-111111111111';
  const second = '22222222-2222-4222-8222-222222222222';

  it('acepta una principal que no sea la primera', () => {
    expect(organizeProductImagesSchema.safeParse({ imageIds: [first, second], primaryImageId: second }).success).toBe(
      true,
    );
  });

  it.each([
    { imageIds: [first, first], primaryImageId: first },
    { imageIds: [first], primaryImageId: second },
    { imageIds: [], primaryImageId: first },
  ])('rechaza una lista incompleta o repetida: %j', (input) => {
    expect(organizeProductImagesSchema.safeParse(input).success).toBe(false);
  });
});
