import type { ClientDocumentType, InvoiceType, OrderStatus } from '../../domain/order';

export interface OrderProductOutput {
  code: string;
  name: string;
  price: number;
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
  invoiceType: InvoiceType;
  invoiceCode: string | null;
  status: OrderStatus;
  observation: string | null;
  totalSale: string;
  numProducts: number;
  createdAt: string;
  createdBy: string;
  client: ClientOutput;
  channel: string;
  products: OrderProductOutput[];
}
