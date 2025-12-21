export interface SuccessParams<T> {
  data: T;
  statusCode?: number;
  code?: string;
}

interface ErrorValidationDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ErrorParams {
  validationErrors?: ErrorValidationDetail[];
  statusCode: number;
  message: string;
  code?: string;
}

export type ErrorResponse = Omit<ErrorParams, 'statusCode'>;
