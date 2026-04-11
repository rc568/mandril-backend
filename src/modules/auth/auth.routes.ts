import { Router } from 'express';
import { adminAccess, protectedRoute } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { loginUserSchema, registerUserSchema } from './auth.validator';

export class AuthRouter {
  static create() {
    const router = Router();

    const authService = new AuthService();
    const authController = new AuthController(authService);

    router.get('/check-auth', protectedRoute, authController.checkAuth);
    router.post('/register', adminAccess, validateRequest({ body: registerUserSchema }), authController.registerUser);
    router.post('/login', validateRequest({ body: loginUserSchema }), authController.loginUser);
    router.post('/token/refresh', authController.refresh);
    router.post('/token/logout', authController.logout);
    router.delete('/:id', adminAccess, validateRequest({ params: paramsUuidv4IdSchema }), authController.deleteUser);

    return router;
  }
}
