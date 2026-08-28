import { BILLING_STATUS, DOCUMENT_NUMBER_TYPE, RECEIPT_TYPE } from '@/shared/domain';
import { z } from '@/shared/libs';
import { baseStringType } from '@/shared/validators';
import { RUC_REGEX } from '../domain';
import { billingOrderValidation } from './billing.validaton';

const clientDocumentTypes = DOCUMENT_NUMBER_TYPE.filter((type) => type !== 'RUC');

const billingBaseSchema = z.object({
  status: z.enum(BILLING_STATUS.filter((status) => status !== 'VOIDED')),
  amount: z
    .number()
    .positive()
    .transform((p) => p.toFixed(6)),
  billingName: baseStringType.max(255).toUpperCase(),
  billingAddress: baseStringType.max(255).optional(),
  note: baseStringType.max(600).optional(),
  code: z.string().optional(),
});

const facturaReceiptType = z.object({
  billingReceiptType: z.literal('FACTURA'),
  billingDocumentNumberType: z.literal('RUC'),
  billingDocumentNumber: z.string().regex(RUC_REGEX),
});

const boletaReceiptType = z.object({
  billingReceiptType: z.literal('BOLETA'),
  billingDocumentNumberType: z.enum(clientDocumentTypes),
  billingDocumentNumber: baseStringType.max(25).toUpperCase().optional(),
});

export const discriminatedReceiptType = z.discriminatedUnion('billingReceiptType', [
  facturaReceiptType,
  boletaReceiptType,
]);

export const billingOrderCreateSchema = billingBaseSchema
  .and(discriminatedReceiptType)
  .check((ctx) => billingOrderValidation({ ctx: ctx, isUpdate: false }));

export const billingOrderUdpateSchema = billingBaseSchema
  .omit({ status: true, code: true })
  .extend({
    billingReceiptType: z.enum(RECEIPT_TYPE),
    billingDocumentNumberType: z.enum(DOCUMENT_NUMBER_TYPE),
    billingDocumentNumber: z.string().toUpperCase(),
  })
  .partial()
  .check((ctx) => billingOrderValidation({ ctx: ctx, isUpdate: true }));

export const issueBillingSchema = z.object({
  code: z.string(),
});

export type BillingOrderCreateDto = z.infer<typeof billingOrderCreateSchema>;
export type BillingOrderUpdateDto = z.infer<typeof billingOrderUdpateSchema>;
export type IssueBillingDto = z.infer<typeof issueBillingSchema>;
