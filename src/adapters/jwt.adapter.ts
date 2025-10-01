import jwt, { type JwtPayload } from 'jsonwebtoken';
import envs from '../config/envs';

export class Jwt {
  static generateAccessToken = <T extends Record<string, any>>(payload: T): Promise<string> => {
    return new Promise((resolve, reject) => {
      jwt.sign(payload, envs.JWT_SECRET_KEY, { expiresIn: envs.JWT_DURATION }, (error, token) => {
        if (error) return reject(error);
        if (!token) return reject(new Error('Token generation return undefined.'));
        resolve(token);
      });
    });
  };

  static generateRefreshToken = <T extends Record<string, any>>(payload: T): Promise<string> => {
    return new Promise((resolve, reject) => {
      jwt.sign(payload, envs.JWT_REFRESH_SECRET_KEY, { expiresIn: envs.JWT_REFRESH_DURATION }, (error, token) => {
        if (error) return reject(error);
        if (!token) return reject(new Error('Token generation return undefined.'));
        resolve(token);
      });
    });
  };

  static verifyAccessToken = <T extends JwtPayload>(token: string): Promise<T | null> => {
    return new Promise((resolve) => {
      jwt.verify(token, envs.JWT_SECRET_KEY, (error, decoded) => {
        if (error || !decoded || typeof decoded === 'string') return resolve(null);
        resolve(decoded as T);
      });
    });
  };

  static verifyRefreshToken = <T extends JwtPayload>(token: string): Promise<T | null> => {
    return new Promise((resolve) => {
      jwt.verify(token, envs.JWT_REFRESH_SECRET_KEY, (error, decoded) => {
        if (error || !decoded || typeof decoded === 'string') return resolve(null);
        resolve(decoded as T);
      });
    });
  };
}
