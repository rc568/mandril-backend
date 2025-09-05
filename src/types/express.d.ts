import type { ApiResponse } from './api-response';

declare module 'express-serve-static-core' {
  interface Response {
    sendResponse(response: ApiResponse): void;
  }
}
