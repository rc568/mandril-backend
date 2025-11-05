import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { CustomError } from '../../domain/errors/custom.error';
import { errorMessages } from '../../domain/messages';

export interface ValidationSchemas {
  params?: ZodType;
  body?: ZodType;
  query?: ZodType;
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
