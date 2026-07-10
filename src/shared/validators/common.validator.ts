import type { ZodObject, ZodType } from 'zod';
import { z } from '@/shared/libs';
import { errorMessages } from '../domain';
import { isValueSerialSmall } from '../utils';

export const smallSerialIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/, errorMessages.common.invalidIdType)
  .transform((val) => Number(val))
  .refine(isValueSerialSmall, errorMessages.common.invalidIdType);

export const uuidV4Schema = z.uuidv4(errorMessages.common.invalidIdType);

export const paramsIdSchema = z.object({ id: smallSerialIdSchema });

export const paramsUuidv4IdSchema = z.object({ id: uuidV4Schema });

export const generateParamsSchema = (schemaMap: Record<string, ZodType>): ZodObject => {
  return z.object(schemaMap);
};

const optionalPrice = z
  .string()
  .transform((val) => (/^-?\d+(\.\d*)?$/.test(val) ? parseFloat(val) : undefined))
  .optional();

const integerString = z.string().transform((val) => (/^-?\d+(\.\d*)?$/.test(val) ? parseInt(val) : undefined));

export const paginationQuerySchema = z.object({
  page: integerString.optional(),
  limit: integerString.optional(),
});

export const infiniteScrollQuerySchema = z.object({
  offset: integerString.optional(),
  limit: integerString.optional(),
});

export const priceQuerySchema = z.object({
  minPrice: optionalPrice,
  maxPrice: optionalPrice,
});

export const baseStringType = z.string().trim().min(1);
export const booleanStringQuery = z
  .string()
  .transform((value) => value === 'true')
  .optional();
