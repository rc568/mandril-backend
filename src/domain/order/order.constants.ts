export const INVOICE_TYPE = ['FACTURA', 'BOLETA', 'SIN COMPROBANTE'] as const;
export const ORDER_STATUS = ['PENDING', 'PAID', 'COMPLETED', 'CANCELLED'] as const;
export const CLIENT_DOCUMENT_TYPE = [
  'SIN DOCUMENTO',
  'CARNE DE EXTRANJERIA',
  'PASAPORTE',
  'DNI',
  'RUC',
  'OTRO',
] as const;

export const ORDER_SORT_BY_OPTIONS = ['total_sale_asc', 'total_sale_desc', 'date_asc', 'date_desc'] as const;

export const RUC_REGEX = /^\d{11}$/;
export const INVOICE_CODE_BOLETA_REGEX = /^EB01-\d{4}$/;
export const INVOICE_CODE_FACTURA_REGEX = /^E001-\d{4}$/;
