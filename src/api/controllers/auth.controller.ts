import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  registerUser = async (req: Request, res: Response) => {
    const user = await this.authService.register(req.validatedBody);
    res.sendResponse({ data: user, errors: null });
  };

  loginUser = async (req: Request, res: Response) => {
    const user = await this.authService.login(req.validatedBody);
    res.sendResponse({ data: user, errors: null });
  };

  //   createCategory = async (req: Request, res: Response) => {
  //     const catalog = await this.authService.create(req.validatedBody);
  //     res.sendResponse({ data: catalog, errors: null });
  //   };

  //   deleteCatalog = async (req: Request, res: Response) => {
  //     const { id } = req.validatedParams;
  //     await this.authService.delete(id);
  //     res.sendResponse({ data: null, errors: null });
  //   };

  //   updateCatalog = async (req: Request, res: Response) => {
  //     const { id } = req.validatedParams;
  //     const catalog = await this.authService.update(id, req.validatedBody);
  //     res.sendResponse({ data: catalog, errors: null });
  //   };
}
