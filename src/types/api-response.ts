export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiResponse<T> {
  data: T | null;
  errors: ApiErrorDetail[] | null;
  success: boolean;
  statusCode: number;
  message: string;
  code?: string;
}

export interface SuccessParams<T> {
  data: T;
  statusCode?: number;
  message?: string;
}

export interface ErrorParams {
  errors?: ApiErrorDetail[] | null;
  statusCode: number;
  message: string;
  code?: string;
}
