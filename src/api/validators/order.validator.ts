import { INVOICE_TYPE, ORDER_STATUS } from '../../domain/order';
import { z } from '../../libs/zod';

export const orderSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  createdAt: z.iso.datetime(),
  salesChannelId: z.number(),
  invoiceType: z.enum(INVOICE_TYPE),
  invoiceCode: z.string(),
  observation: z.string(),
  status: z.enum(ORDER_STATUS),
});

export type OrderDto = z.infer<typeof orderSchema>;
