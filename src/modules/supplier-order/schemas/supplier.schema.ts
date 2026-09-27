import { z } from '@/shared/libs';
import { baseStringType, paginationQuerySchema } from '@/shared/validators';

const supplierFieldsSchema = z.object({
  name: baseStringType.max(255),
  description: baseStringType.nullish(),
  isActive: z.boolean(),
});

export const createSupplierSchema = supplierFieldsSchema.extend({
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = supplierFieldsSchema.partial().check(({ value, issues }) => {
  if (!Object.values(value).some((field) => field !== undefined)) {
    issues.push({ code: 'custom', input: value, message: errorMessages.common.bodyEmpty });
  }
});

export const getSuppliersQuerySchema = paginationQuerySchema.extend({
  search: baseStringType.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type SupplierCreateDto = z.infer<typeof createSupplierSchema>;
export type SupplierUpdateDto = z.infer<typeof updateSupplierSchema>;
export type GetSuppliersQuery = z.infer<typeof getSuppliersQuerySchema>;

import { errorMessages } from '@/shared/domain';
