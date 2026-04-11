import type { Request } from 'express-serve-static-core';
import { CustomError } from '@/shared/domain';
import type { CustomPayload } from './types';

export function requireAuth(req: Request): asserts req is Request & { user: CustomPayload } {
  if (!req.user?.id || !req.user?.role || !req.user?.userName) {
    throw CustomError.unauthorized('Authentication required');
  }
}
