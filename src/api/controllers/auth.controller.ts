import type { Request, Response } from 'express';
import { accessTokenOptions, refreshTokenOptions } from '../../config/cookie';
import { CustomError } from '../../domain/errors/custom.error';
import { errorMessages, successMessages } from '../../domain/messages';
import type { AuthService } from '../services';
import { requireAuth } from '../utils';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerUser = async (req: Request, res: Response) => {
    const user = await this.authService.register(req.validatedBody);
    return res.sendSuccess({ data: user, statusCode: 201, message: successMessages.auth.register });
  };

  loginUser = async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await this.authService.login(req.validatedBody);

    res.cookie('accessToken', accessToken, accessTokenOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenOptions);

    return res.sendSuccess({ data: user, message: successMessages.auth.login });
  };

  checkAuth = async (req: Request, res: Response) => {
    requireAuth(req);
    const user = await this.authService.checkAuth(req.user.userName);
    return res.sendSuccess({ data: user });
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken) throw CustomError.unauthorized(errorMessages.auth.missingToken);

    const accessToken = await this.authService.refresh(refreshToken);

    res.cookie('accessToken', accessToken, accessTokenOptions);

    return res.sendSuccess({ data: null, message: successMessages.auth.refreshToken });
  };

  logout = async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken) throw CustomError.unauthorized(errorMessages.auth.missingToken);

    await this.authService.logout(refreshToken);

    res.clearCookie('accessToken', accessTokenOptions);
    res.clearCookie('refreshToken', refreshTokenOptions);

    return res.sendSuccess({ data: null, message: successMessages.auth.logout });
  };

  deleteUser = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const isDeleted = await this.authService.softDelete(id);

    if (isDeleted) return res.sendSuccess({ data: null, message: successMessages.auth.deleteUser });
  };
}
