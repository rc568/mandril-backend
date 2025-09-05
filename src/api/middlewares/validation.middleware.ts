import type { NextFunction, Request, Response } from 'express';
import type { ZodObject } from 'zod';

export const validateRequest = (schema: ZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      if (result.error) {
        return next(result.error);
      }

      req.validatedParams = result.data.params;
      req.validatedBody = result.data.body;
      req.validatedQuery = result.data.query;

      next();
    } catch (error) {
      next(error);
    }
  };
};
