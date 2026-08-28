import type { OrderProductDto } from '../schemas/order.schema';
import type { ORDER_PRODUCT_TYPE, ORDER_SORT_BY_OPTIONS, ORDER_STATUS, ORDER_TYPE } from './order.constants';

export type OrderStatus = (typeof ORDER_STATUS)[number];
export type OrderSortBy = (typeof ORDER_SORT_BY_OPTIONS)[number];
export type OrderType = (typeof ORDER_TYPE)[number];
export type OrderProductType = (typeof ORDER_PRODUCT_TYPE)[number];

export interface OrderProductDtoDetail extends Omit<OrderProductDto, 'price'> {
  price: string;
  purchasePrice: string;
  currentStock: number;
}

export type OrderProductDtoOperation = Omit<OrderProductDtoDetail, 'currentStock'> & {
  stockToAdd: number;
} & ({ currentStock: number; type: 'SALE' } | { type: 'RETURN' });
