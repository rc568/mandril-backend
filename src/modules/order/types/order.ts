import type { ClientDocumentType, InvoiceType, OrderProductType, OrderStatus, OrderType } from '../domain';

export interface OrderProductOutput {
  code: string;
  name: string;
  type: OrderProductType;
  relatedOrderId: string | null;
  price: string;
  purchasePrice: string;
  quantity: number;
  variantId: number;
}

interface ClientOutput {
  id: string;
  bussinessName: string | null;
  contactName: string | null;
  documentNumber: string | null;
  documentType: ClientDocumentType | null;
}

export interface OrderOutput {
  id: string;
  type: OrderType;
  invoiceType: InvoiceType;
  invoiceCode: string | null;
  status: OrderStatus;
  observation: string | null;
  totalSale: string;
  totalCost: string;
  numProducts: number;
  createdAt: string;
  createdBy: string;
  client: ClientOutput;
  channel: string;
  products: OrderProductOutput[];
}
