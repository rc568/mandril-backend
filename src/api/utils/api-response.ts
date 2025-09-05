import type { ApiResponse } from '../../types/api-response';

export function sendResponse(
  this: any,
  { data = null, message = 'Ok', success = true, statusCode = 200, errors = null }: ApiResponse,
) {
  return this.status(statusCode).json({ success, statusCode, data, message, errors });
}
