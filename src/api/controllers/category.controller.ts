import type { Request, Response } from 'express';
import type { CategoryService } from '../services/category.service';

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
    const categoryCreated = await this.categoryService.create(req.validatedBody);
    res.sendSuccess({
      data: categoryCreated,
      message: 'Category created succesfully.',
      statusCode: 201,
    });
  };

  deleteCategory = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.categoryService.delete(+id);
    return res.sendSuccess({ data: null });
  };

  updateCategory = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const updatedCategory = await this.categoryService.update(id, req.validatedBody);
    return res.sendSuccess({ data: updatedCategory });
  };
}
