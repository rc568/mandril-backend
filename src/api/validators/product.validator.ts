import * as z from 'zod';
import { isValidSlug, isValueSerialSmall } from '../utils';
import { smallSerialIdSchema } from './common.validator';

const variantAttributeValueMapSchema = z.array(
  z.object({
    attributeId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
    valueId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
  }),
);

const productAttributeSchema = z.array(
  z.object({
    attributeId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
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

const productSchema = z
  .object({
    name: z.string().max(255),
    slug: z
      .string('Slug must be an string')
      .max(255)
      .refine(isValidSlug, 'Slug must be lowercase letters, numbers and hyphens only.'),
    description: z.string().optional(),
    categoryId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
    catalogId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
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
          message: 'Cannot create a product with a single variant when attributes are defined.',
          path: ['variants'],
        });
      }

      const id = new Set(ctx.value.attributesId.map((a) => a.attributeId));

      if (id.size !== ctx.value.attributesId.length) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: 'Product Attributes must be unique.',
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
          message: "Variant Attributes aren't consistent or duplicated.",
          path: ['variants', 'attributes', 'attributeId'],
        });
      }
    } else {
      if (ctx.value.variants.length > 1) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: 'Cannot create a product with more than 1 variant without a attribute.',
          path: ['variants'],
        });
      }

      if (ctx.value.variants.some((v) => v.attributes && v.attributes.length > 0)) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: 'Variants cannot have attributes when they are not defined at the product level.',
          path: ['variants'],
        });
      }
    }
  });

const updateProductSchemaDto = productSchema
  .partial()
  .omit({
    attributesId: true,
  })
  .extend({
    isActive: z.boolean().optional(),
    variants: z
      .array(
        productVariantSchema.partial().extend({
          variantId: z.number().refine(isValueSerialSmall, 'Not a valid Id'),
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
              message: `Variant with id ${variant.variantId} has duplicated attributes.`,
              path: ['variants'],
            });
          }
        }
      }

      if (ctx.value.variants.length !== uniqueVariants.size) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value,
          message: 'Variants are duplicated.',
          path: ['variants'],
        });
      }
    }
  });

export const createProductSchema = z.object({
  body: productSchema,
});

export const updateProductSchema = z.object({
  params: z.object({ id: smallSerialIdSchema }),
  body: updateProductSchemaDto,
});

export type ProductDto = z.infer<typeof productSchema>;
export type ProductUpdateDto = z.infer<typeof updateProductSchemaDto>;
export type ProductVariantDto = z.infer<typeof productVariantSchema>;
export type VariantAttributeMapDto = z.infer<typeof variantAttributeValueMapSchema>;

export async function validateProduct(data: { [key: string]: any }) {
  return await productSchema.safeParseAsync(data);
}

export async function partialValidateProduct(data: { [key: string]: any }) {
  return await productSchema.partial().safeParseAsync(data);
}
