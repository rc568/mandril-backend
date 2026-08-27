import type { BillingStatus, DocumentNumberType, ReceiptType } from '@/shared/domain';

export interface BillingOrderOutput {
  id: string;
  code: string;
  amount: string;
  status: BillingStatus;
  createdAt: string;
  createdBy: string;
  billingName: string;
  billingReceiptType: ReceiptType;
  billingDocumentNumberType: DocumentNumberType;
  billingDocumentNumber: string | null;
}
