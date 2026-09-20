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
