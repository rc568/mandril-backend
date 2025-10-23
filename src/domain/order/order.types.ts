import type { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE, ORDER_STATUS } from './order.constants';

export type ClientDocumentType = (typeof CLIENT_DOCUMENT_TYPE)[number];
export type InvoiceType = (typeof INVOICE_TYPE)[number];
export type OrderStatus = (typeof ORDER_STATUS)[number];
