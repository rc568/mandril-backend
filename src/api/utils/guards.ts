import type { Request } from 'express-serve-static-core';
import { CustomError } from '../../domain/errors/custom.error';
import type { CustomPayload } from '../../types/jwt.types';

export function requireAuth(req: Request): asserts req is Request & { user: CustomPayload } {
  if (!req.user?.id || !req.user?.role || !req.user?.userName) {
    throw CustomError.unauthorized('Authentication required');
  }
}
