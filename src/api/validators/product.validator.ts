import { errorMessages } from '../../domain/messages';
import { z } from '../../libs/zod';
import { isValidSlug, isValueSerialSmall } from '../utils';
import { paginationQuerySchema, priceQuerySchema } from './common.validator';

const variantAttributeValueMapSchema = z.array(
  z.object({
    attributeId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
    valueId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  }),
);

const productAttributeSchema = z.array(
  z.object({
    attributeId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  }),
);

const productVariantSchema = z.object({
  price: z
    .number()
    .positive()
    .transform((p) => p.toFixed(6)),
  purchasePrice: z
    .number()
    .positive()
    .transform((p) => p.toFixed(6)),
  quantityInStock: z.number().int().min(0).optional().default(0),
});

export const createProductSchema = z
  .object({
    name: z.string().max(255),
    slug: z.string().max(255).refine(isValidSlug, errorMessages.common.slugFormat),
    description: z.string().optional(),
    categoryId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
    catalogId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
    attributesId: productAttributeSchema.optional(),
    variants: z
      .array(
        productVariantSchema.extend({
          attributes: variantAttributeValueMapSchema.optional(),
        }),
      )
      .nonempty(),
  })
  .check((ctx) => {
    if (ctx.value.attributesId && ctx.value.attributesId.length > 0) {
      if (ctx.value.variants.length === 1) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.attributesWithOnlyOneVariant,
          path: ['variants'],
        });
      }

      const id = new Set(ctx.value.attributesId.map((a) => a.attributeId));

      if (id.size !== ctx.value.attributesId.length) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.productAttributesNotUnique,
          path: ['attributesId'],
        });
      }

      const variantsAttrInId = ctx.value.variants.every((v) => {
        if (v.attributes && v.attributes.length === id.size) {
          const idToCheck = new Set(v.attributes.map((attr) => attr.attributeId));

          return id.difference(idToCheck).size === 0;
        }
        return false;
      });

      if (!variantsAttrInId) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.variantAttributesNotConsistent,
          path: ['variants', 'attributes', 'attributeId'],
        });
      }
    } else {
      if (ctx.value.variants.length > 1) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.variantWithoutAttributes,
          path: ['variants'],
        });
      }

      if (ctx.value.variants.some((v) => v.attributes && v.attributes.length > 0)) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.productWithoutAttributes,
          path: ['variants'],
        });
      }
    }
  });

export const updateProductSchema = createProductSchema
  .partial()
  .omit({
    attributesId: true,
  })
  .extend({
    isActive: z.boolean().optional(),
    variants: z
      .array(
        productVariantSchema.partial().extend({
          variantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
          isActive: z.boolean().optional(),
          attributes: variantAttributeValueMapSchema.optional(),
        }),
      )
      .optional(),
  })
  .check((ctx) => {
    if (ctx.value.variants && ctx.value.variants.length > 0) {
      const uniqueVariants = new Set<number>();

      for (const variant of ctx.value.variants) {
        uniqueVariants.add(variant.variantId);
        if (variant.attributes) {
          const uniqueAttribues = new Set(variant.attributes.map((attr) => attr.attributeId));

          if (variant.attributes.length !== uniqueAttribues.size) {
            ctx.issues.push({
              code: 'custom',
              input: ctx.value,
              message: errorMessages.product.variantAttributesNotConsistent,
              path: ['variants', 'attributes'],
            });
          }
        }
      }

      if (ctx.value.variants.length !== uniqueVariants.size) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: errorMessages.product.duplicatedVariants,
          path: ['variants'],
        });
      }
    }
  });

export const getAllProductQuerySchema = z.object({
  ...paginationQuerySchema.shape,
  ...priceQuerySchema.shape,
  orderBy: z.string().optional(),
  categoryId: z
    .string()
    .transform((val) => (/^\d+$/.test(val) ? parseInt(val) : undefined))
    .transform((val) => (val && isValueSerialSmall(val) ? val : undefined))
    .optional(),
  catalogId: z
    .string()
    .transform((val) => (/^\d+$/.test(val) ? parseInt(val) : undefined))
    .transform((val) => (val && isValueSerialSmall(val) ? val : undefined))
    .optional(),
});

export type typePrice = z.infer<typeof getAllProductQuerySchema>;

export type ProductDto = z.infer<typeof createProductSchema>;
export type ProductUpdateDto = z.infer<typeof updateProductSchema>;
export type ProductVariantDto = z.infer<typeof productVariantSchema>;
export type VariantAttributeMapDto = z.infer<typeof variantAttributeValueMapSchema>;
