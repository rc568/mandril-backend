import type { NextFunction, Request, Response } from 'express-serve-static-core';
import type { Payload } from '@/shared/auth';
import { CustomError, errorMessages } from '@/shared/domain';
import { Jwt } from '@/shared/libs/jwt';

export const authenticateToken = async (req: Request, _res: Response, next: NextFunction) => {
  const { accessToken } = req.cookies;
  if (!accessToken) throw CustomError.unauthorized(errorMessages.auth.missingToken);

  const decoded = await Jwt.verifyAccessToken<Payload>(accessToken);
  if (!decoded) throw CustomError.unauthorized(errorMessages.auth.invalidJwt);

  req.user = {
    id: decoded.id,
    userName: decoded.userName,
    role: decoded.role,
  };
  next();
};
