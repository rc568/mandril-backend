import type { Request, Response } from 'express';
import { accessTokenOptions, refreshTokenOptions } from '../../config/cookie';
import { errorMessages, successMessages } from '../../domain/constants';
import type { AuthService } from '../services/auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerUser = async (req: Request, res: Response) => {
    const user = await this.authService.register(req.validatedBody);
    return res.sendResponse({ data: user, errors: null, statusCode: 201, message: successMessages.auth.register });
  };

  loginUser = async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await this.authService.login(req.validatedBody);

    res.cookie('accessToken', accessToken, accessTokenOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenOptions);

    return res.sendResponse({ data: user, errors: null, message: successMessages.auth.login });
  };

  refresh = async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken)
      return res.sendResponse({ data: null, statusCode: 401, errors: errorMessages.auth.missingToken });

    const accessToken = await this.authService.refresh(refreshToken);

    res.cookie('accessToken', accessToken, accessTokenOptions);

    return res.sendResponse({ data: null, errors: null, message: successMessages.auth.refreshToken });
  };

  logout = async (req: Request, res: Response) => {
    const { refreshToken } = req.cookies;
    if (!refreshToken)
      return res.sendResponse({ data: null, statusCode: 401, errors: errorMessages.auth.missingToken });

    await this.authService.logout(refreshToken);

    res.clearCookie('accessToken', accessTokenOptions);
    res.clearCookie('refreshToken', refreshTokenOptions);

    return res.sendResponse({ data: null, errors: null, message: successMessages.auth.logout });
  };

  deleteUser = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const isDeleted = await this.authService.softDelete(id);

    if (isDeleted) return res.sendResponse({ data: null, errors: null, message: successMessages.auth.deleteUser });
  };
}
