import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValidSlug, isValueSerialSmall } from '@/shared/utils';
import { baseStringType, paginationQuerySchema, priceQuerySchema, smallSerialIdSchema } from '@/shared/validators';
import { productValidation } from './product.validation';

const variantAttributeSchema = z.object({
  attributeId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  valueId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
});

const productAttributeSchema = z
  .array(
    z.object({
      attributeId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
    }),
  )
  .nonempty();

const baseProductVariantSchema = z.object({
  price: z
    .number()
    .positive()
    .transform((p) => p.toFixed(6)),
  purchasePrice: z
    .number()
    .positive()
    .transform((p) => p.toFixed(6)),
  quantityInStock: z.number().int().min(0),
  isActive: z.boolean().default(true),
  attributes: z.array(variantAttributeSchema).nonempty().optional(),
});

const updateProductVariantSchema = baseProductVariantSchema.extend({
  isActive: z.boolean(),
  variantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType).optional(),
});

const productGeneralInfoSchema = z.object({
  name: baseStringType.max(255),
  slug: baseStringType.max(255).refine(isValidSlug, errorMessages.common.slugFormat),
  description: baseStringType.optional(),
  categoryId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  catalogId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  isActive: z.boolean().default(true),
});

export const createProductSchema = productGeneralInfoSchema
  .extend({
    attributesId: productAttributeSchema.optional(),
    variants: z.array(baseProductVariantSchema).nonempty(),
  })
  .check((ctx) => productValidation({ ctx }));

export const updateProductSchema = createProductSchema
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    variants: z.array(updateProductVariantSchema).nonempty().optional(),
  })
  .check((ctx) => productValidation({ ctx, options: { isUpdate: true } }));

export const getAllProductQuerySchema = z.object({
  ...paginationQuerySchema.shape,
  ...priceQuerySchema.shape,
  orderBy: z.string().optional(),
  search: z.string().optional(),
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
  isActive: z
    .string()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .optional(),
});

export const getByIdentifierParams = z.object({
  identifier: z.union([smallSerialIdSchema, z.string()]),
});

export const forceProductWillBecomeWithoutAttributesQuery = z.object({
  force: z
    .string()
    .transform((value) => value === 'true')
    .optional(),
});

export type ProductCreateDto = z.infer<typeof createProductSchema>;
export type ProductUpdateDto = z.infer<typeof updateProductSchema>;
export type ProductAttributesDto = z.infer<typeof productAttributeSchema>;
export type ProductGeneralInfoDto = z.infer<typeof productGeneralInfoSchema>;
export type BaseProductVariantDto = z.infer<typeof baseProductVariantSchema>;
export type UpdateProductVariantDto = z.infer<typeof updateProductVariantSchema>;
export type VariantAttributeDto = z.infer<typeof variantAttributeSchema>;
export type GetProductsQuery = z.infer<typeof getAllProductQuerySchema>;
