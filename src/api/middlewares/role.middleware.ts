import type { NextFunction, Request, Response } from 'express-serve-static-core';
import { CustomError } from '../../domain/errors/custom.error';
import { errorMessages } from '../../domain/messages';
import type { UserRole } from '../../domain/user';

export const roleAuthorization = (roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const allowedRoles = new Set(roles);
    const role = req.user?.role;
    if (!role) throw CustomError.forbidden(errorMessages.auth.roleNotFound);

    if (!allowedRoles.has(role)) throw CustomError.forbidden(errorMessages.auth.notAllowed);

    next();
  };
};
