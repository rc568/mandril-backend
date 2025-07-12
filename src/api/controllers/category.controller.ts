import type { Request, Response } from 'express';
import type { CategoryService } from '../services/category.service';
import { partialValidateCategory, validateCategory } from '../validators/category.validator';

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  getCategories = (_req: Request, res: Response) => {
    const categories = this.categoryService.getAll();
    res.status(200).json(categories);
  };

  getCategoryById = (req: Request, res: Response) => {
    const { id } = req.params;

    const category = this.categoryService.getById(+id);
    if (!category) res.status(404).json({ message: `category with ${id} not found` });

    res.status(200).json(category);
  };

  createCategory = async (req: Request, res: Response) => {
    const result = await validateCategory(req.body);
    if (!result.success) res.status(400).json({ error: result.error.issues });

    if (!result.data) return res.status(400).json({ error: 'Invalid category data' });

    const newCategory = this.categoryService.create(result.data);

    res.status(200).json(newCategory);
  };

  deleteCategory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const categoryDeleted = this.categoryService.delete(+id);
    if (!categoryDeleted) {
      res.status(404).json({ message: `category with ${id} not found` });
      return;
    }
    res.status(200).json({ message: `category with id ${id} was deleted` });
    return;
  };

  updateCategory = async (req: Request, res: Response) => {
    const result = await partialValidateCategory(req.body);
    if (!result.success) res.status(400).json({ error: result.error.issues });

    if (!result.data) return res.status(400).json({ error: 'Invalid category data' });

    const { id } = req.params;
    const updatedCategory = this.categoryService.update(+id, result.data);
    if (!updatedCategory) {
      res.status(404).json({ message: `category with ${id} not found` });
      return;
    }

    res.status(200).json(updatedCategory);
  };
}
