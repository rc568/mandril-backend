import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import envs from '../../config/envs';
import { CustomError } from '../../domain/errors/custom.error';

export const errorHandler = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof CustomError) {
    if (envs.NODE_ENV === 'development' && error.originalError) {
      console.log('=====================');
      console.error('Original Error:', error.name);
      console.log('=====================');
    }

    // TODO LOGGING (production)

    return res.sendResponse({
      success: false,
      data: null,
      message: error.message,
      statusCode: error.statusCode,
      errors: [],
    });
  }

  // For example Errors from ZOD (TODO)
  if (error instanceof ZodError) {
    if (envs.NODE_ENV === 'development') {
      console.log('=====================');
      console.error('Zod error Name:', error.name);
      console.error('Zod error Issues:', error.issues);
      console.error('Zod error Message:', error.message);
      console.error('Zod error Stack:', error.stack);
      console.log('=====================');
    }

    const errorsToSend = error.issues.map((issue) => {
      return `${issue.path}: ${issue.message}`;
    });

    return res.sendResponse({
      success: false,
      data: null,
      message: 'Validation Problem',
      statusCode: 400,
      errors: errorsToSend,
    });
  }

  if (envs.NODE_ENV === 'development') {
    console.log('=====================');
    console.error('Unhandled error:', error);
    console.log('=====================');
  }

  // TODO LOGGING (production)

  return res.sendResponse({
    success: false,
    data: null,
    message: 'Internal Server Error, contact the administrator.',
    statusCode: 500,
    errors: 'An unexpected error occurred',
  });
};
