import jwt from 'jsonwebtoken';
import envs from '../config/envs';

export class Jwt {
  static generate = (payload: any) => {
    return new Promise((resolve) => {
      jwt.sign(payload, envs.JWT_SECRET_KEY, { expiresIn: '2h' }, (error, token) => {
        if (error) return resolve(null);
        resolve(token);
      });
    });
  };

  static verify = (token: any) => {
    return new Promise((resolve) => {
      jwt.verify(token, envs.JWT_SECRET_KEY, (error: Error | null, decoded: any) => {
        if (error) return resolve(null);
        resolve(decoded);
      });
    });
  };
}
