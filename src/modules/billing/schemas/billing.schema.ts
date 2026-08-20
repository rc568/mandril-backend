import { BILLING_STATUS, DOCUMENT_NUMBER_TYPE } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType, uuidV4Schema } from '@/shared/validators';
import { INVOICE_CODE_BOLETA_REGEX, INVOICE_CODE_FACTURA_REGEX, RUC_REGEX } from '../domain';

const clientDocumentTypes = DOCUMENT_NUMBER_TYPE.filter((type) => type !== 'RUC');

const billingBaseSchema = z.object({
  orderId: uuidV4Schema,
  status: z.enum(BILLING_STATUS),
  billingName: baseStringType.max(255).toUpperCase(),
  billingAddress: baseStringType.max(255),
  note: baseStringType.max(600),
});

export const billingSchema = z.discriminatedUnion('receiptType', [
  billingBaseSchema.extend({
    receiptType: z.literal('FACTURA'),
    code: z.string().regex(INVOICE_CODE_FACTURA_REGEX),
    documentType: z.literal('RUC'),
    documentNumber: z.string().regex(RUC_REGEX),
  }),
  billingBaseSchema.extend({
    receiptType: z.literal('BOLETA'),
    code: z.string().regex(INVOICE_CODE_BOLETA_REGEX),
    documentType: z.enum(clientDocumentTypes),
    documentNumber: baseStringType.max(25).toUpperCase().optional(),
  }),
]);
