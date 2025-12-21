import type { Request, Response } from 'express';
import type { CategoryService } from '../services';
import { requireAuth } from '../utils';

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  getCategories = async (_req: Request, res: Response) => {
    const categories = await this.categoryService.getAll();
    res.sendSuccess({ data: categories });
  };

  getCategoryById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const category = await this.categoryService.getById(id);
    res.sendSuccess({ data: category });
  };

  createCategory = async (req: Request, res: Response) => {
    requireAuth(req);
    const categoryCreated = await this.categoryService.create(req.validatedBody, req.user.id);
    res.sendSuccess({
      data: categoryCreated,
      statusCode: 201,
    });
  };

  softDeleteCategory = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const force = req.validatedQuery.force === 'true';
    await this.categoryService.softDelete(id, force, req.user.id);
    return res.sendSuccess({ data: null });
  };

  updateCategory = async (req: Request, res: Response) => {
    requireAuth(req);
    const { id } = req.validatedParams;
    const updatedCategory = await this.categoryService.update(id, req.validatedBody, req.user.id);
    return res.sendSuccess({ data: updatedCategory });
  };
}
