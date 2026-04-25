import { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE, ORDER_STATUS } from '@/modules/order';
import { z } from '@/shared/libs';

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
  documentNumber: z.string(),
  bussinessName: z.string(),
  contactName: z.string(),
  email: z.email().optional(),
  phoneNumber1: z.string().optional(),
  phoneNumber2: z.string().optional(),
});
