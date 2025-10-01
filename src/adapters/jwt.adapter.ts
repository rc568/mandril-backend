import jwt, { type JwtPayload } from 'jsonwebtoken';
import envs from '../config/envs';

export class Jwt {
  static generateAccessToken = <T extends Record<string, any>>(payload: T): Promise<string | undefined> => {
    return new Promise((resolve, rejected) => {
      jwt.sign(payload, envs.JWT_SECRET_KEY, { expiresIn: envs.JWT_DURATION }, (error, token) => {
        if (error) rejected(error);
        resolve(token);
      });
    });
  };

  static generateRefreshToken = <T extends Record<string, any>>(payload: T): Promise<string | undefined> => {
    return new Promise((resolve, rejected) => {
      jwt.sign(payload, envs.JWT_REFRESH_SECRET_KEY, { expiresIn: envs.JWT_REFRESH_DURATION }, (error, token) => {
        if (error) rejected(error);
        resolve(token);
      });
    });
  };

  static verifyAccessToken = <T extends JwtPayload>(token: string): Promise<T | null> => {
    return new Promise((resolve, rejected) => {
      jwt.verify(token, envs.JWT_SECRET_KEY, (error, decoded) => {
        if (error) rejected(error);
        resolve(decoded as T);
      });
    });
  };

  static verifyRefreshToken = <T extends JwtPayload>(token: string): Promise<T | null> => {
    return new Promise((resolve, rejected) => {
      jwt.verify(token, envs.JWT_REFRESH_SECRET_KEY, (error, decoded) => {
        if (error) rejected(error);
        resolve(decoded as T);
      });
    });
  };
}
