import { z } from 'zod';
import { isValueSerialSmall } from '../utils';

export const smallSerialIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/, 'Not a valid Id')
  .transform((val) => Number(val))
  .refine(isValueSerialSmall, 'Inconsistent Value');
