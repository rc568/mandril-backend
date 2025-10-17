import type { NextFunction, Request, Response } from 'express-serve-static-core';
import { Jwt } from '../../adapters/jwt.adapter';
import { CustomError } from '../../domain/errors/custom.error';
import { errorMessages } from '../../domain/messages';
import type { Payload } from '../../types/jwt.types';

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
