import { errorCodes } from './error-codes';

interface CustomErrorParams {
  statusCode: number;
  message: string;
  code?: string;
  originalError?: Error;
}

export class CustomError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly originalError?: Error;

  constructor({ message, statusCode, code, originalError }: CustomErrorParams) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.originalError = originalError;
  }

  static badRequest(message: string, code: string = errorCodes.BAD_REQUEST) {
    return new CustomError({ statusCode: 400, message, code });
  }

  static unauthorized(message: string, code: string = errorCodes.UNAUTHORIZED) {
    return new CustomError({ statusCode: 401, message, code });
  }

  static forbidden(message: string, code: string = errorCodes.FORBIDDEN) {
    return new CustomError({ statusCode: 403, message, code });
  }

  static notFound(message: string, code: string = errorCodes.NOT_FOUND) {
    return new CustomError({ statusCode: 404, message, code });
  }

  static conflict(message: string, code: string = errorCodes.CONFLICT) {
    return new CustomError({ statusCode: 409, message, code });
  }

  static internalServer(message: string, originalError?: Error, code: string = errorCodes.INTERNAL_SERVER_ERROR) {
    return new CustomError({ statusCode: 500, message, code, originalError });
  }
}
