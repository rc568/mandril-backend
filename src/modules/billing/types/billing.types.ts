import type { DOCUMENT_NUMBER_TYPE } from '@/shared/domain';
import type { BILLING_STATUS, RECEIPT_TYPE } from '../domain';

type ReceiptType = (typeof RECEIPT_TYPE)[number];
type BillingStatus = (typeof BILLING_STATUS)[number];
type DocumentNumberType = (typeof DOCUMENT_NUMBER_TYPE)[number];

export interface BillingOrderOutput {
  id: string;
  code: string;
  status: BillingStatus;
  billingName: string;
  billingReceiptType: ReceiptType;
  billingDocumentNumberType: DocumentNumberType;
  billingDocumentNumber: string | null;
}
