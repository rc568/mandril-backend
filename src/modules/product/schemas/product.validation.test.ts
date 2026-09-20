import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorMessages } from '@/shared/domain';
import { getVariantOfferError } from './product.validation';

const variant = {
  price: '100.000000',
  offerPrice: '80.000000',
  offerStartsAt: new Date('2026-09-20T13:00:00Z'),
  offerEndsAt: new Date('2026-09-21T13:00:00Z'),
};

test('rejects lowering the regular price below a retained offer', () => {
  assert.equal(getVariantOfferError({ ...variant, price: '70.000000' }), errorMessages.product.invalidOfferPrice);
  assert.equal(getVariantOfferError({ ...variant, price: '80.000000' }), errorMessages.product.invalidOfferPrice);
  assert.equal(getVariantOfferError({ ...variant, price: '80.000001' }), undefined);
});

test('requires removing all offer fields together', () => {
  assert.equal(getVariantOfferError({ ...variant, offerPrice: null }), errorMessages.product.incompleteOffer);
  assert.equal(
    getVariantOfferError({ price: variant.price, offerPrice: null, offerStartsAt: null, offerEndsAt: null }),
    undefined,
  );
});

test('validates updated dates against retained dates', () => {
  assert.equal(
    getVariantOfferError({ ...variant, offerStartsAt: variant.offerEndsAt }),
    errorMessages.product.invalidOfferDates,
  );
  assert.equal(getVariantOfferError(variant), undefined);
});
