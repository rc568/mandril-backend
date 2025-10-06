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

  static badRequest(message: string, code?: string) {
    return new CustomError({ statusCode: 400, message, code });
  }

  static unauthorized(message: string, code?: string) {
    return new CustomError({ statusCode: 401, message, code });
  }

  static forbidden(message: string, code?: string) {
    return new CustomError({ statusCode: 403, message, code });
  }

  static notFound(message: string, code?: string) {
    return new CustomError({ statusCode: 404, message, code });
  }

  static conflict(message: string, code?: string) {
    return new CustomError({ statusCode: 409, message, code });
  }

  static internalServer(message: string, originalError?: Error) {
    return new CustomError({ statusCode: 500, message, originalError });
  }
}
