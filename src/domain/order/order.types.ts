import type { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE, ORDER_SORT_BY_OPTIONS, ORDER_STATUS } from './order.constants';

export type ClientDocumentType = (typeof CLIENT_DOCUMENT_TYPE)[number];
export type InvoiceType = (typeof INVOICE_TYPE)[number];
export type OrderStatus = (typeof ORDER_STATUS)[number];
export type OrderSortBy = (typeof ORDER_SORT_BY_OPTIONS)[number];

export interface OrderOptions {
  page?: number;
  limit?: number;
  minDate?: string;
  maxDate?: string;
  channel?: string;
  invoiceType?: string;
  status?: string;
  search?: string;
  sortBy: string;
}
