import type { ZodObject, ZodType } from 'zod';
import { errorMessages } from '../../domain/constants';
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
