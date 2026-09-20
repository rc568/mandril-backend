import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductSchema, updateProductSchema } from './product.schema';

const product = {
  name: 'Producto de prueba',
  slug: 'producto-de-prueba',
  categoryId: 1,
  catalogId: 1,
};

const variant = { price: 100, purchasePrice: 50, quantityInStock: 5, isActive: true };
const measurements = [
  'lengthCm',
  'widthCm',
  'heightCm',
  'weightGrams',
  'packageLengthCm',
  'packageWidthCm',
  'packageHeightCm',
] as const;

test('accepts existing payloads without optional variant details', () => {
  const result = createProductSchema.parse({ ...product, variants: [variant] });
  assert.equal(result.variants[0].lengthCm, undefined);
  assert.equal(result.variants[0].price, '100.000000');
});

test('stores measurements with two decimals and accepts nullable details', () => {
  const details = Object.fromEntries(measurements.map((field) => [field, 12.34]));
  const result = createProductSchema.parse({
    ...product,
    variants: [{ ...variant, ...details, warrantyMonths: 12, stockAlertThreshold: 0 }],
  });
  for (const field of measurements) assert.equal(result.variants[0][field], '12.34');
  assert.equal(result.variants[0].stockAlertThreshold, 0);
  const cleared = updateProductSchema.parse({
    variants: [
      {
        ...variant,
        variantId: 1,
        ...Object.fromEntries(measurements.map((field) => [field, null])),
        warrantyMonths: null,
        stockAlertThreshold: null,
      },
    ],
  });
  for (const field of measurements) assert.equal(cleared.variants?.[0][field], null);
});

test('rejects nonpositive, excessive precision and overflowing measurements', () => {
  for (const field of measurements) {
    for (const value of [0, -1, 1.001, 10000000000]) {
      assert.equal(
        createProductSchema.safeParse({ ...product, variants: [{ ...variant, [field]: value }] }).success,
        false,
        `${field}: ${value}`,
      );
    }
  }
});

test('rejects fractional, negative and overflowing warranty or stock thresholds', () => {
  for (const field of ['warrantyMonths', 'stockAlertThreshold']) {
    for (const value of [-1, 1.5, 2147483648]) {
      assert.equal(
        createProductSchema.safeParse({ ...product, variants: [{ ...variant, [field]: value }] }).success,
        false,
      );
    }
  }
});

const offer = {
  offerPrice: 80,
  offerStartsAt: '2026-09-20T08:00:00-05:00',
  offerEndsAt: '2026-09-21T08:00:00-05:00',
};

test('parses an offer with timezone and keeps the regular price', () => {
  const result = createProductSchema.parse({ ...product, variants: [{ ...variant, ...offer }] }).variants[0];
  assert.equal(result.price, '100.000000');
  assert.equal(result.offerPrice, '80.000000');
  assert.equal(result.offerStartsAt?.toISOString(), '2026-09-20T13:00:00.000Z');
});

test('rejects incomplete offers, invalid prices and invalid dates on creation', () => {
  for (const changes of [
    { offerPrice: 100 },
    { offerPrice: 101 },
    { offerPrice: 0 },
    { offerPrice: -1 },
    { offerPrice: 0.0000001 },
    { offerPrice: 1000000 },
    { offerPrice: null },
    { offerStartsAt: undefined },
    { offerEndsAt: null },
    { offerEndsAt: offer.offerStartsAt },
    { offerEndsAt: '2026-09-19T08:00:00-05:00' },
    { offerStartsAt: '2026-09-20T08:00:00' },
    { offerEndsAt: 'invalid' },
  ]) {
    assert.equal(
      createProductSchema.safeParse({ ...product, variants: [{ ...variant, ...offer, ...changes }] }).success,
      false,
      JSON.stringify(changes),
    );
  }
});

test('accepts clearing an offer and leaves omitted update fields undefined', () => {
  const cleared = updateProductSchema.parse({
    variants: [{ ...variant, variantId: 1, offerPrice: null, offerStartsAt: null, offerEndsAt: null }],
  });
  assert.equal(cleared.variants?.[0].offerPrice, null);
  const omitted = updateProductSchema.parse({ variants: [{ ...variant, variantId: 1 }] });
  assert.equal(omitted.variants?.[0].offerPrice, undefined);
  const partial = updateProductSchema.parse({ variants: [{ ...variant, variantId: 1, offerPrice: 75 }] });
  assert.equal(partial.variants?.[0].offerPrice, '75.000000');
});
