import type { BILLING_STATUS, CLIENT_DOCUMENT_NUMBER_TYPE, DOCUMENT_NUMBER_TYPE, RECEIPT_TYPE } from '../constants';

export type ClientDocumentNumberType = (typeof CLIENT_DOCUMENT_NUMBER_TYPE)[number];
export type DocumentNumberType = (typeof DOCUMENT_NUMBER_TYPE)[number];
export type ReceiptType = (typeof RECEIPT_TYPE)[number];
export type BillingStatus = (typeof BILLING_STATUS)[number];
