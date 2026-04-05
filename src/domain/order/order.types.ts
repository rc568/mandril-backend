import type { OrderProductDto } from '../../api/validators';
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

export interface OrderProductCurrStockAndCost extends OrderProductDto {
  currentStock: number;
  purchasePrice: string;
}

export type OrderProductOperationStock =
  | {
      variantId: number;
      price: string;
      purchasePrice: string;
      quantity: number;
      currentStock: number;
      stockToAdd: number;
      deletedProduct: false;
    }
  | {
      variantId: number;
      price: string;
      purchasePrice: string;
      quantity: number;
      stockToAdd: number;
      deletedProduct: true;
    };
