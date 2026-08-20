import { RECEIPT_TYPE } from '@/shared/domain';

export const ORDER_STATUS = ['PENDING', 'PAID', 'COMPLETED', 'CANCELLED'] as const;
export const ORDER_TYPE = ['SALE', 'EXCHANGE', 'RETURN'] as const;
export const ORDER_PRODUCT_TYPE = ['SALE', 'RETURN'] as const;
export const ORDER_SORT_BY_OPTIONS = ['total_sale_asc', 'total_sale_desc', 'date_asc', 'date_desc'] as const;
export const RECEIPT_TYPE_FILTER = [...RECEIPT_TYPE, 'SIN COMPROBANTE'] as const;
