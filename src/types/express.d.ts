import type { ErrorParams, SuccessParams } from './api-response';
import type { CustomPayload } from './jwt.types';

declare module 'express-serve-static-core' {
  interface Response {
    sendSuccess<T>(data: SuccessParams<T>): void;
    sendError(data: ErrorParams): void;
  }

  interface Request {
    validatedBody?: any;
    validatedParams?: any;
    validatedQuery?: any;
    user?: CustomPayload;
  }
}
