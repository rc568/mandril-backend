import { Router } from 'express';
import { AuthController } from '../controllers';
import { validateRequest } from '../middlewares';
import { AuthService } from '../services';
import { adminAccess, protectedRoute } from '../utils/auth-access';
import { loginUserSchema, paramsUuidv4IdSchema, registerUserSchema } from '../validators';

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
