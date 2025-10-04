import type { Request } from 'express-serve-static-core';
import type { UserRole } from '../../domain/constants';
import { CustomError } from '../../domain/errors/custom.error';

export function requireAuth(req: Request): asserts req is Request & { userId: string; userRole: UserRole } {
  if (!req.user?.id || !req.user?.role) {
    throw CustomError.unauthorized('Authentication required');
  }
}
