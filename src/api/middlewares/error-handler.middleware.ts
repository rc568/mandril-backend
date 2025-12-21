import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import envs from '../../config/envs';
import { CustomError, errorCodes } from '../../domain/errors';
import { errorMessages } from '../../domain/messages';

export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof CustomError) {
    if (envs.NODE_ENV === 'development' && error.originalError) {
      console.log('=====================');
      console.error('Original Error:', error.name);
      console.log('=====================');
    }

    // TODO LOGGING (production)

    return res.sendError({
      message: error.message,
      statusCode: error.statusCode,
      code: error.code,
    });
  }

  if (error instanceof ZodError) {
    if (envs.NODE_ENV === 'development') {
      console.log('=====================');
      console.error('Zod error Name:', error.name);
      console.error('Zod error Issues:', error.issues);
      console.error('Zod error Message:', error.message);
      console.error('Zod error Stack:', error.stack);
      console.log('=====================');
    }

    return res.sendError({
      message: errorMessages.common.validationError,
      statusCode: 400,
      code: errorCodes.VALIDATION_ERROR,
      validationErrors: error.issues.map((issue) => {
        return {
          field: issue.path.join('/'),
          message: issue.message,
          code: issue.code,
        };
      }),
    });
  }

  if (envs.NODE_ENV === 'development') {
    console.log('=====================');
    console.error('Unhandled error:', error);
    console.log('=====================');
  }

  // TODO LOGGING (production)

  return res.sendError({
    message: errorMessages.common.internalServerError,
    statusCode: 500,
  });
};
