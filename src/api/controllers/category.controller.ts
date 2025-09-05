import type { Request, Response } from 'express';
import type { CategoryService } from '../services/category.service';

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  getCategories = async (_req: Request, res: Response) => {
    const categories = await this.categoryService.getAll();
    res.sendResponse({ success: true, data: categories, errors: null });
  };

  getCategoryById = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const category = await this.categoryService.getById(id);
    res.sendResponse({ success: true, data: category, message: 'Ok', errors: null });
  };

  createCategory = async (req: Request, res: Response) => {
    const categoryCreated = await this.categoryService.create(req.validatedBody);
    res.sendResponse({
      success: true,
      data: categoryCreated,
      message: 'Category created succesfully.',
      errors: null,
      statusCode: 201,
    });
  };

  deleteCategory = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    await this.categoryService.delete(+id);
    return res.sendResponse({
      success: true,
      data: null,
      errors: null,
    });
  };

  updateCategory = async (req: Request, res: Response) => {
    const { id } = req.validatedParams;
    const updatedCategory = await this.categoryService.update(id, req.validatedBody);
    return res.sendResponse({
      success: true,
      data: updatedCategory,
      errors: null,
    });
  };
}
