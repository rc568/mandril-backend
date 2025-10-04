import type { ApiResponse } from './api-response';
import type { CustomPayload } from './jwt.types';

declare module 'express-serve-static-core' {
  interface Response {
    sendResponse(response: ApiResponse): void;
  }

  interface Request {
    validatedBody?: any;
    validatedParams?: any;
    validatedQuery?: any;
    user?: CustomPayload;
  }
}
