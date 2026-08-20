import type { ErrorParams, SuccessParams } from '@/app/api-response.types';
import type { CustomPayload } from '@/shared/auth';

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
