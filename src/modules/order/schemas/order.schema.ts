import { errorMessages } from '@/shared/domain';
import { z } from '@/shared/libs';
import { isValueSerialSmall } from '@/shared/utils';
import type { DistributiveOmit, DistributivePick } from '@/shared/utils/types-utils';
import { baseStringType, paginationQuerySchema } from '@/shared/validators';
import {
  CLIENT_DOCUMENT_TYPE,
  INVOICE_CODE_BOLETA_REGEX,
  INVOICE_CODE_FACTURA_REGEX,
  ORDER_STATUS,
  RUC_REGEX,
} from '../domain';
import { orderValidation } from './order.validation';

const boletaDocumentTypes = CLIENT_DOCUMENT_TYPE.filter((type) => type !== 'RUC');

const orderProductSchema = z.object({
  variantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
});

const baseClientSchema = z.object({
  contactName: baseStringType.max(255).optional(),
  email: z.email().max(255).optional(),
  phoneNumber1: baseStringType.max(25).optional(),
  phoneNumber2: baseStringType.max(25).optional(),
});

const baseOrderSchema = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.enum(ORDER_STATUS).default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(orderProductSchema).nonempty(),
  client: baseClientSchema,
});

export const invoiceSchema = z.discriminatedUnion('invoiceType', [
  z.object({
    invoiceType: z.literal('SIN COMPROBANTE'),
    client: z.object({
      documentType: z.literal('SIN DOCUMENTO'),
    }),
  }),
  z.object({
    invoiceType: z.literal('FACTURA'),
    invoiceCode: z.string().regex(INVOICE_CODE_FACTURA_REGEX),
    client: z.object({
      documentType: z.literal('RUC'),
      documentNumber: z.string().regex(RUC_REGEX),
      bussinessName: baseStringType.max(255).toUpperCase(),
    }),
  }),
  z.object({
    invoiceType: z.literal('BOLETA'),
    invoiceCode: z.string().regex(INVOICE_CODE_BOLETA_REGEX),
    client: z.object({
      documentType: z.enum(boletaDocumentTypes),
      documentNumber: baseStringType.max(25).toUpperCase(),
      bussinessName: baseStringType.max(255).toUpperCase(),
    }),
  }),
]);

export const createOrderSchema = baseOrderSchema.and(invoiceSchema).check((ctx) => orderValidation(ctx));

const updateInvoiceSchema = z.discriminatedUnion('invoiceType', [
  invoiceSchema.options[0],
  invoiceSchema.options[1],
  invoiceSchema.options[2],
  z.object({ invoiceType: z.undefined() }),
]);

export const updateOrderSchema = baseOrderSchema
  .partial()
  .extend({ status: z.enum(ORDER_STATUS).optional() })
  .and(updateInvoiceSchema)
  .check((ctx) => orderValidation(ctx, true));

export const orderQuerySchema = z.object({
  ...paginationQuerySchema.shape,
  minDate: z.iso.datetime().optional(),
  maxDate: z.iso.datetime().optional(),
  channel: z
    .string()
    .transform((val) => (/^\d+$/.test(val) ? parseInt(val) : undefined))
    .transform((val) => (val && isValueSerialSmall(val) ? val : undefined))
    .optional(),
  invoiceType: z.string().toUpperCase().optional(),
  status: z.string().toUpperCase().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
});

export type OrderCreateDto = z.infer<typeof createOrderSchema>;
export type OrderUpdateDto = z.infer<typeof updateOrderSchema>;
export type OrderProductDto = z.infer<typeof orderProductSchema>;
export type InvoiceSchema = z.infer<typeof invoiceSchema>;
export type GeneralOrderDto = DistributiveOmit<OrderCreateDto, 'products' | 'client'>;
export type ClientDto = DistributivePick<OrderCreateDto, 'client'>['client'];
