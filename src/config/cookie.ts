import type { CookieOptions } from 'express-serve-static-core';
import envs from './envs';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: envs.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 1000 * 60 * 15,
};

export const accessTokenOptions: CookieOptions = {
  ...cookieOptions,
};

export const refreshTokenOptions: CookieOptions = {
  ...cookieOptions,
  path: '/api/auth/token',
  maxAge: 1000 * 60 * 60 * 24,
};
