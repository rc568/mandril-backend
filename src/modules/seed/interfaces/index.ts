import type { OrderStatus } from '@/modules/order';
import type { CLIENT_DOCUMENT_TYPE, INVOICE_TYPE } from '../constants';

type ClientDocumentType = (typeof CLIENT_DOCUMENT_TYPE)[number];
type InvoiceType = (typeof INVOICE_TYPE)[number];

export interface Catalog {
  name: string;
  slug: string;
}

export interface Category {
  name: string;
  slug: string;
  parentId?: null | number;
}

export interface Product {
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  categoryId: number;
  catalogId: number;
}

export interface ProductImages {
  imageUrl: string;
  productVariantId: number;
}

export interface ProductVariant {
  code: string;
  price: number;
  purchasePrice: number;
  quantityInStock: number;
  isActive: boolean;
  productId: number;
}

export interface VariantAttribute {
  name: string;
  description?: string;
}

export interface VariantAttributeValue {
  value: string;
  variantAttributeId: number;
}

export interface ProductVariantToValue {
  productVariantId: number;
  variantAttributeValueId: number;
  variantAttributeId: number;
}

export interface ProductToVariantAttribute {
  productId: number;
  variantAttributeId: number;
}

export interface SkuCounter {
  prefix: string;
  value: number;
}

export interface SalesChannel {
  channel: string;
}

export interface Order {
  id: string;
  clientId: string;
  createdAt: string;
  salesChannelId: number;
  invoiceType: InvoiceType;
  invoiceCode: string | null;
  observation: string | null;
  status: OrderStatus;
}

export interface Client {
  id: string;
  documentType: ClientDocumentType;
  documentNumber: string | null;
  bussinessName: string;
  contactName: string;
  email: string;
  phoneNumber1: string;
  phoneNumber2?: string;
}

export interface OrderProducts {
  orderId: string;
  productVariantId: number;
  price: number;
  purchasePrice: number;
  quantity: number;
}
