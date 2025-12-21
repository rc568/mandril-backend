import type { Response } from 'express-serve-static-core';
import type { ErrorParams, ErrorResponse, SuccessParams } from '../../types/api-response';

export function sendSuccess<T>(this: Response, { data, statusCode = 200 }: SuccessParams<T>) {
  return this.status(statusCode).json(data);
}

export function sendError(this: Response, { message, statusCode, code, validationErrors }: ErrorParams) {
  const response: ErrorResponse = {
    validationErrors: validationErrors,
    message: message,
    code: code,
  };
  return this.status(statusCode).json(response);
}
