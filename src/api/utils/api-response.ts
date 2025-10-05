import type { Response } from 'express-serve-static-core';
import type { ApiResponse, ErrorParams, SuccessParams } from '../../types/api-response';

export function sendSuccess<T>(this: Response, { data, message = 'Ok', statusCode = 200 }: SuccessParams<T>) {
  const response: ApiResponse<T> = {
    data: data,
    errors: null,
    success: true,
    statusCode: statusCode,
    message: message,
    code: undefined,
  };
  return this.status(statusCode).json(response);
}

export function sendError(this: Response, { message, statusCode, code, errors = null }: ErrorParams) {
  const response: ApiResponse<null> = {
    data: null,
    errors: errors,
    success: false,
    statusCode: statusCode,
    message: message,
    code: code,
  };
  return this.status(statusCode).json(response);
}
