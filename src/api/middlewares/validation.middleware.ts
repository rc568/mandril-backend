import type { NextFunction, Request, Response } from 'express';
import type { ZodObject } from 'zod';
import { errorMessages } from '../../domain/constants';
import { CustomError } from '../../domain/errors/custom.error';

export interface ValidationSchemas {
  params?: ZodObject;
  body?: ZodObject;
  query?: ZodObject;
}

export const validateRequest = (schemas: ValidationSchemas) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.validatedParams = await schemas.params.parseAsync(req.params);
      }
      if (schemas.body) {
        if (Object.keys(req.body).length === 0) throw CustomError.badRequest(errorMessages.common.bodyEmpty);
        req.validatedBody = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.validatedQuery = await schemas.query.parseAsync(req.query);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
