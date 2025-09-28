import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { validateRequest } from '../middlewares';
import { AuthService } from '../services/auth.service';
import { loginUserSchema, registerUserSchema } from '../validators';

export class AuthRouter {
  static create() {
    const router = Router();

    const authService = new AuthService();
    const authController = new AuthController(authService);

    router.post('/register', validateRequest(registerUserSchema), authController.registerUser);
    router.post('/login', validateRequest(loginUserSchema), authController.loginUser);

    return router;
  }
}
