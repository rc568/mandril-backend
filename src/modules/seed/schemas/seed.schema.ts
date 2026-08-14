import { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE, ORDER_STATUS } from '@/modules/order';
import { z } from '@/shared/libs';

export const orderSeedSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  createdAt: z.iso.datetime(),
  salesChannelId: z.number(),
  invoiceType: z.enum(INVOICE_TYPE),
  invoiceCode: z.string().nullable(),
  observation: z.string().nullable(),
  totalSale: z
    .number()
    .min(0)
    .transform((val) => val.toFixed(6)),
  totalCost: z
    .number()
    .min(0)
    .transform((val) => val.toFixed(6)),
  numProducts: z.number().int().min(0),
  status: z.enum(ORDER_STATUS),
});

export const clientSeedSchema = z.object({
  id: z.uuid(),
  documentType: z.enum(CLIENT_DOCUMENT_TYPE),
  documentNumber: z.string().nullable(),
  bussinessName: z.string().nullable(),
  contactName: z.string().nullable(),
  email: z.email().nullable(),
  phoneNumber1: z.string().nullable(),
  phoneNumber2: z.string().nullable(),
});
