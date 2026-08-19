export const RECEIPT_TYPE = ['FACTURA', 'BOLETA'] as const;
export const BILLING_STATUS = ['PENDING', 'ISSUED', 'VOIDED'] as const;
export const RUC_REGEX = /^\d{11}$/;
export const INVOICE_CODE_BOLETA_REGEX = /^EB01-\d{4}$/;
export const INVOICE_CODE_FACTURA_REGEX = /^E001-\d{4}$/;
