import { errorMessages } from '../../domain/messages';
import {
  CLIENT_DOCUMENT_TYPE,
  INVOICE_CODE_BOLETA_REGEX,
  INVOICE_CODE_FACTURA_REGEX,
  INVOICE_TYPE,
  ORDER_STATUS,
  RUC_REGEX,
} from '../../domain/order';
import { z } from '../../libs/zod';
import { isValueSerialSmall } from '../utils';
import { baseStringType, paginationQuerySchema } from '.';

const boletaDocumentTypes = CLIENT_DOCUMENT_TYPE.filter((type) => type !== 'RUC');

export const orderSeedSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  createdAt: z.iso.datetime(),
  salesChannelId: z.number(),
  invoiceType: z.enum(INVOICE_TYPE),
  invoiceCode: z.string(),
  observation: z.string(),
  totalSale: z
    .number()
    .min(0)
    .transform((val) => val.toFixed(6)),
  numProducts: z.number().int().min(0),
  status: z.enum(ORDER_STATUS),
});

const orderProductSchema = z.object({
  variantId: z.number().refine(isValueSerialSmall, errorMessages.common.invalidIdType),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
});

const baseOrderSchema = z.object({
  salesChannelId: z.number().int().positive(),
  status: z.enum(ORDER_STATUS).default('PENDING'),
  observation: baseStringType.optional(),
  products: z.array(orderProductSchema).min(1),
});

const baseClientSchema = z.object({
  contactName: baseStringType.max(255).optional(),
  email: z.email().max(255).optional(),
  phoneNumber1: baseStringType.max(25).optional(),
  phoneNumber2: baseStringType.max(25).optional(),
});

const noInvoiceSchema = baseOrderSchema.extend({
  invoiceType: z.literal('SIN COMPROBANTE'),
  client: baseClientSchema.extend({
    documentType: z.literal('SIN DOCUMENTO'),
  }),
});

const facturaSchema = baseOrderSchema.extend({
  invoiceType: z.literal('FACTURA'),
  invoiceCode: z.string().regex(INVOICE_CODE_FACTURA_REGEX),
  client: baseClientSchema.extend({
    documentType: z.literal('RUC'),
    documentNumber: z.string().regex(RUC_REGEX),
    bussinessName: baseStringType.max(255).toUpperCase(),
  }),
});

const boletaSchema = baseOrderSchema.extend({
  invoiceType: z.literal('BOLETA'),
  invoiceCode: z.string().regex(INVOICE_CODE_BOLETA_REGEX),
  client: baseClientSchema.extend({
    documentType: z.enum(boletaDocumentTypes),
    documentNumber: baseStringType.max(25).toUpperCase(),
    bussinessName: baseStringType.max(255).toUpperCase(),
  }),
});

export const orderSchema = z
  .discriminatedUnion('invoiceType', [noInvoiceSchema, facturaSchema, boletaSchema])
  .check((ctx) => {
    const uniqueProducts = new Set(ctx.value.products.map((p) => p.variantId));
    if (uniqueProducts.size !== ctx.value.products.length) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value.products,
        message: errorMessages.order.duplicatedProducts,
        path: ['products'],
      });
    }
  });

export const updateOrderSchema = z
  .object({
    ...baseOrderSchema.omit({ status: true }).partial().shape,
    observation: baseOrderSchema.shape.observation.nullable(),
    status: z.enum(ORDER_STATUS).optional(),
    invoiceType: z.enum(INVOICE_TYPE).optional(),
    invoiceCode: z.string().max(50).optional(),
    client: baseClientSchema
      .partial()
      .extend({
        documentType: z.enum(CLIENT_DOCUMENT_TYPE).optional(),
        documentNumber: baseStringType.max(25).toUpperCase().optional(),
        bussinessName: baseStringType.max(255).toUpperCase().optional(),
      })
      .optional(),
  })
  .check((ctx) => {
    if (ctx.value.products && ctx.value.products.length > 0) {
      const uniqueProducts = new Set(ctx.value.products.map((p) => p.variantId));
      if (uniqueProducts.size !== ctx.value.products.length) {
        ctx.issues.push({
          code: 'custom',
          input: ctx.value.products,
          message: errorMessages.order.duplicatedProducts,
          path: ['products'],
        });
      }
    }
    if (ctx.value.client && Object.keys(ctx.value.client).length <= 0) {
      ctx.issues.push({
        code: 'custom',
        input: ctx.value.client,
        message: errorMessages.common.bodyEmpty,
        path: ['client'],
      });
    }
  });

export const invoiceSchema = z.discriminatedUnion('invoiceType', [
  z.object({
    invoiceType: noInvoiceSchema.shape.invoiceType,
    client: z.object({
      documentType: noInvoiceSchema.shape.client.shape.documentType,
    }),
  }),
  z.object({
    invoiceType: boletaSchema.shape.invoiceType,
    invoiceCode: boletaSchema.shape.invoiceCode,
    client: z.object({
      documentType: boletaSchema.shape.client.shape.documentType,
      documentNumber: boletaSchema.shape.client.shape.documentNumber,
      bussinessName: boletaSchema.shape.client.shape.bussinessName,
    }),
  }),
  z.object({
    invoiceType: facturaSchema.shape.invoiceType,
    invoiceCode: facturaSchema.shape.invoiceCode,
    client: z.object({
      documentType: facturaSchema.shape.client.shape.documentType,
      documentNumber: facturaSchema.shape.client.shape.documentNumber,
      bussinessName: facturaSchema.shape.client.shape.bussinessName,
    }),
  }),
]);

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

export type OrderDto = z.infer<typeof orderSchema>;
export type OrderUpdateDto = z.infer<typeof updateOrderSchema>;
export type OrderProductDto = z.infer<typeof orderProductSchema>;
export type InvoiceSchema = z.infer<typeof invoiceSchema>;
