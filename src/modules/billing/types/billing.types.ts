import type { BillingStatus, DocumentNumberType, ReceiptType } from '@/shared/domain';

export interface BillingOrderOutput {
  id: string;
  code: string;
  status: BillingStatus;
  billingName: string;
  billingReceiptType: ReceiptType;
  billingDocumentNumberType: DocumentNumberType;
  billingDocumentNumber: string | null;
}
