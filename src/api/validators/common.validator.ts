import type { ZodObject, ZodType } from 'zod';
import { errorMessages } from '../../domain/messages';
import { z } from '../../libs/zod';
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

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .transform((val) => (/^-?\d+(\.\d*)?$/.test(val) ? parseInt(val) : undefined))
    .optional(),
  limit: z
    .string()
    .transform((val) => (/^-?\d+(\.\d*)?$/.test(val) ? parseInt(val) : undefined))
    .optional(),
});

export const priceQuerySchema = z.object({
  minPrice: optionalPrice,
  maxPrice: optionalPrice,
});
