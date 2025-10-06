import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateRequest } from '../middlewares';
import { AuthService } from '../services/auth.service';
import { loginUserSchema, registerUserSchema, uuidv4IdSchema } from '../validators';

export class AuthRouter {
  static create() {
    const router = Router();

    const authService = new AuthService();
    const authController = new AuthController(authService);

    router.post('/register', validateRequest({ body: registerUserSchema }), authController.registerUser);
    router.post('/login', validateRequest({ body: loginUserSchema }), authController.loginUser);
    router.post('/token/refresh', authController.refresh);
    router.post('/token/logout', authController.logout);
    router.delete('/:id', validateRequest({ params: uuidv4IdSchema }), authController.deleteUser);

    return router;
  }
}
