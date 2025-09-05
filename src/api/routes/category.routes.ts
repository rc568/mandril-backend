import { Router } from 'express';
import { CategoryController } from '../controllers/';
import { validateRequest } from '../middlewares';
import { CategoryService } from '../services/category.service';
import {
  createCategorySchema,
  idSchema,
  updateCategorySchema,
} from '../validators/category.validator';

export class CategoryRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const categoryController = new CategoryController(categoryService);

    router.get('/', categoryController.getCategories);
    router.get('/:id', validateRequest(idSchema), categoryController.getCategoryById);
    router.post('/', validateRequest(createCategorySchema), categoryController.createCategory);
    router.delete('/:id', validateRequest(idSchema), categoryController.deleteCategory);
    router.patch('/:id', validateRequest(updateCategorySchema), categoryController.updateCategory);

    return router;
  }
}
