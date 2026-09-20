import { errorMessages } from '@/shared/domain';
import type { z } from '@/shared/libs';
import { normalizeArray } from '@/shared/utils';

interface VariantOffer {
  price: string;
  offerPrice?: string | null;
  offerStartsAt?: Date | null;
  offerEndsAt?: Date | null;
}

export const getVariantOfferError = (variant: VariantOffer): string | undefined => {
  const { price, offerPrice, offerStartsAt, offerEndsAt } = variant;
  if (offerPrice == null && offerStartsAt == null && offerEndsAt == null) return;
  if (offerPrice == null || offerStartsAt == null || offerEndsAt == null) {
    return errorMessages.product.incompleteOffer;
  }
  if (Number(offerPrice) <= 0 || Number(offerPrice) >= Number(price)) {
    return errorMessages.product.invalidOfferPrice;
  }
  if (offerEndsAt.getTime() <= offerStartsAt.getTime()) {
    return errorMessages.product.invalidOfferDates;
  }
};

interface ProductCheckContext {
  attributesId?: { attributeId: number }[];
  variants?: (VariantOffer & {
    variantId?: number;
    attributes?: { attributeId: number; valueId: number }[];
  })[];
}

interface Props {
  ctx: z.core.ParsePayload<ProductCheckContext>;
  options?: { isUpdate?: boolean };
}

const defaultOptions = { isUpdate: false };

export const productValidation = ({ ctx, options = defaultOptions }: Props) => {
  const { value, issues } = ctx;
  const { isUpdate = false } = options;

  value.variants?.forEach((variant, index) => {
    const hasCompleteOfferInput =
      variant.offerPrice !== undefined && variant.offerStartsAt !== undefined && variant.offerEndsAt !== undefined;
    if (isUpdate && variant.variantId !== undefined && !hasCompleteOfferInput) return;
    const message = getVariantOfferError(variant);
    if (message) issues.push({ code: 'custom', input: variant, message, path: ['variants', index, 'offerPrice'] });
  });

  if (value.attributesId && value.attributesId?.length > 0) {
    if (isUpdate && !value.variants) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.attributesWithoutVariants,
        path: ['variants'],
      });

      return;
    }

    if (value.variants?.length === 1) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.attributesWithOnlyOneVariant,
        path: ['variants'],
      });
    }

    const attributesIdsSet = new Set(value.attributesId?.map((a) => a.attributeId));

    if (attributesIdsSet.size !== value.attributesId.length) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.productAttributesNotUnique,
        path: ['attributesId'],
      });
    }

    const variantAttributeValueSet = new Set<string>();
    const variantsIdsSet = new Set<number>();

    const allAttributesInVariants = value.variants?.every((v) => {
      if (v.variantId !== undefined) variantsIdsSet.add(v.variantId);

      if (v.attributes?.length === attributesIdsSet.size) {
        const atttributeIdsInVariantSet = new Set(v.attributes.map((a) => a.attributeId));
        variantAttributeValueSet.add(normalizeArray(v.attributes));

        return attributesIdsSet.difference(atttributeIdsInVariantSet).size === 0;
      }

      return false;
    });

    if (!allAttributesInVariants) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.variantAttributesNotConsistent,
        path: ['variants', 'attributes', 'attributeId'],
      });
    }

    if (variantAttributeValueSet.size !== value.variants?.length) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.variantsWithSameAttributesValues,
        path: ['variants', 'attributes', 'attributeId', 'valueId'],
      });
    }

    if (isUpdate) {
      const variantsIdRepeat = variantsIdsSet.size !== value.variants?.filter((v) => v.variantId).length;

      if (variantsIdRepeat) {
        issues.push({
          code: 'custom',
          input: value,
          message: errorMessages.product.duplicatedVariants,
          path: ['variants', 'variantId'],
        });
      }
    }
  } else {
    if (value.variants && (value.variants.length > 1 || value.variants?.some((v) => v.attributes))) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.productWithoutAttributes,
        path: ['attributesId'],
      });
    }

    if (isUpdate && value.variants?.some((v) => v.variantId === undefined)) {
      issues.push({
        code: 'custom',
        input: value,
        message: errorMessages.product.variantAlreadyExists,
        path: ['variants', 'variantId'],
      });
    }
  }
};
