import type { BillingOrderOutput } from '@/modules/billing/types';
import type { ClientDocumentNumberType } from '@/shared/domain';
import type { OrderProductType, OrderStatus, OrderType } from '../domain';

interface VariantAttributes {
  value: string;
  valueId: number;
  attribute: string;
  attributeId: number;
}

export interface OrderProductOutput {
  code: string;
  name: string;
  type: OrderProductType;
  price: string;
  purchasePrice: string;
  quantity: number;
  variantId: number;
  variantAttributes: VariantAttributes[];
}

interface ClientOutput {
  id: string;
  email: string | null;
  contactName: string | null;
  documentNumber: string | null;
  documentNumberType: ClientDocumentNumberType | null;
  phoneNumber1: string | null;
}

export interface OrderOutput {
  id: string;
  type: OrderType;
  status: OrderStatus;
  relatedOrderId: string | null;
  observation: string | null;
  totalSale: string;
  totalCost: string;
  numProducts: number;
  createdAt: string;
  createdBy: string;
  client: ClientOutput;
  channel: string;
  products: OrderProductOutput[];
  billing: BillingOrderOutput[];
}

export interface RemainingQuantity {
  productVariantId: number;
  quantitySold: number;
  quantityReturned: number;
  priceProductToReturn: string;
  purchasePriceProductToReturn: string;
}
