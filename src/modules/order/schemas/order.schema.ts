import { CLIENT_DOCUMENT_NUMBER_TYPE, errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import type { DistributiveOmit, DistributivePick } from '@/shared/utils/types-utils';
import { baseStringType, paginationQuerySchema } from '@/shared/validators';
import { ORDER_PRODUCT_TYPE, ORDER_STATUS, ORDER_TYPE } from '../domain';
import { orderValidation } from './order.validation';

const orderStatusWithoutCancelled = ORDER_STATUS.filter((status) => status !== 'CANCELLED');

const orderProductSchema = z.object({
  variantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  type: z.enum(ORDER_PRODUCT_TYPE).default('SALE'),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
});

const clientSchema = z.object({
  contactName: baseStringType.max(255).optional(),
  email: z.email().max(255).optional(),
  phoneNumber1: baseStringType.max(25).optional(),
  phoneNumber2: baseStringType.max(25).optional(),
  documentNumberType: z.enum(CLIENT_DOCUMENT_NUMBER_TYPE).optional(),
  documentNumber: baseStringType.max(25).toUpperCase().optional(),
});

const baseOrderSchema = z.object({
  salesChannelId: z.number().int().positive(),
  type: z.enum(ORDER_TYPE).default('SALE'),
  relatedOrderId: z.uuidv4().optional(),
  status: z.enum(orderStatusWithoutCancelled).default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(orderProductSchema).nonempty(),
  client: clientSchema.optional(),
});

export const createOrderSchema = baseOrderSchema.check((ctx) => orderValidation({ ctx, isUpdate: false }));

export const updateOrderSchema = baseOrderSchema
  .omit({ type: true, relatedOrderId: true })
  .partial()
  .extend({ status: z.enum(ORDER_STATUS).optional() })
  .check((ctx) => orderValidation({ ctx, isUpdate: true }));

export const orderQuerySchema = z.object({
  ...paginationQuerySchema.shape,
  minDate: z.iso.datetime().optional(),
  maxDate: z.iso.datetime().optional(),
  channel: z
    .string()
    .transform((val) => (/^\d+$/.test(val) ? parseInt(val) : undefined))
    .transform((val) => (val && isValueSerialSmall(val) ? val : undefined))
    .transform((val) => val?.toString())
    .optional(),
  receiptType: z.string().toUpperCase().optional(),
  status: z.string().toUpperCase().optional(),
  billingStatus: z.string().toUpperCase().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
});

export type OrderCreateDto = z.infer<typeof createOrderSchema>;
export type OrderUpdateDto = z.infer<typeof updateOrderSchema>;
export type OrderProductDto = z.infer<typeof orderProductSchema>;
export type OrderQuerySchema = z.infer<typeof orderQuerySchema>;
export type GeneralUpdateOrderDto = DistributiveOmit<OrderUpdateDto, 'products' | 'client'>;
export type ClientDto = DistributivePick<OrderCreateDto, 'client'>['client'];
