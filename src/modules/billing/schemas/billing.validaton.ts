import { errorMessages } from '@/shared/domain';
import type { z } from '@/shared/libs';
import { INVOICE_CODE_BOLETA_REGEX, INVOICE_CODE_FACTURA_REGEX } from '../domain';
import { type BillingOrderCreateDto, type BillingOrderUpdateDto, discriminatedReceiptType } from './billing.schema';

type BillingOrderValidation =
  | {
      ctx: z.core.ParsePayload<BillingOrderCreateDto>;
      isUpdate: false;
    }
  | {
      ctx: z.core.ParsePayload<BillingOrderUpdateDto>;
      isUpdate: true;
    };

const IDENTITY_RECEIPT_FIELDS = [
  'billingName',
  'billingReceiptType',
  'billingDocumentNumberType',
  'billingDocumentNumber',
] as const;
const REQUIRED_IDENTITY_RECEIPT_FIELDS = ['billingName', 'billingReceiptType', 'billingDocumentNumberType'] as const;

export const billingOrderValidation = (params: BillingOrderValidation) => {
  if (!params.isUpdate) {
    const { issues, value } = params.ctx;

    if (value.status === 'PENDING' && value.code) {
      issues.push({
        code: 'custom',
        input: value.code,
        message: errorMessages.billing.receiptCodeOnPendingBilling,
        path: ['status'],
      });
    }

    if (value.status === 'ISSUED') {
      if (!value.code) {
        issues.push({
          code: 'custom',
          input: value.code,
          message: errorMessages.billing.missingReceiptCode,
          path: ['code'],
        });
      }

      if (value.code) {
        if (value.billingReceiptType === 'BOLETA' && !INVOICE_CODE_BOLETA_REGEX.test(value.code)) {
          issues.push({
            code: 'custom',
            input: value.code,
            message: errorMessages.billing.invalidInvoiceCodeBoleta,
            path: ['code'],
          });
        }

        if (value.billingReceiptType === 'FACTURA' && !INVOICE_CODE_FACTURA_REGEX.test(value.code)) {
          issues.push({
            code: 'custom',
            input: value.code,
            message: errorMessages.billing.invalidInvoiceCodeFactura,
            path: ['code'],
          });
        }
      }
    }
  }

  if (params.isUpdate) {
    const { issues, value } = params.ctx;
    const hasAnyIdentityField = IDENTITY_RECEIPT_FIELDS.some((field) => value[field] !== undefined);
    const hasRequiredIdentityFields = REQUIRED_IDENTITY_RECEIPT_FIELDS.every((field) => value[field] !== undefined);
    const documentNumberMayBeOmitted = value.billingDocumentNumberType === 'SIN DOCUMENTO';
    const hasRequiredDocumentNumber = documentNumberMayBeOmitted || value.billingDocumentNumber !== undefined;

    if (hasAnyIdentityField && (!hasRequiredIdentityFields || !hasRequiredDocumentNumber)) {
      issues.push({
        code: 'custom',
        input: value.billingReceiptType,
        message: errorMessages.billing.identityReceiptBlockMustBeComplete,
        path: ['billingReceiptType'],
      });
      return;
    }

    if (hasRequiredIdentityFields && hasRequiredDocumentNumber) {
      const result = discriminatedReceiptType.safeParse(value);
      if (!result.success) {
        result.error.issues.forEach((iss) => issues.push(iss));
        return;
      }
    }
  }

  const { issues, value } = params.ctx;

  if (value.billingDocumentNumberType === 'SIN DOCUMENTO' && value.billingDocumentNumber !== undefined) {
    issues.push({
      code: 'custom',
      input: value.billingDocumentNumber,
      message: errorMessages.billing.cannotSetDocumentNumber,
      path: ['billingDocumentNumber'],
    });
  }

  if (
    value.billingDocumentNumberType &&
    value.billingDocumentNumberType !== 'SIN DOCUMENTO' &&
    !value.billingDocumentNumber
  ) {
    issues.push({
      code: 'custom',
      input: value.billingDocumentNumber,
      message: errorMessages.billing.missingDocumentNumber,
      path: ['billingDocumentNumber'],
    });
  }
};
