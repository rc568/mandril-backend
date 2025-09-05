import { Router } from 'express';
import { CategoryController } from '../controllers/';
import { validateRequest } from '../middlewares';
import { CategoryService } from '../services/category.service';
import { createCategorySchema, paramsIdSchema, updateCategorySchema } from '../validators';

export class CategoryRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const categoryController = new CategoryController(categoryService);

    router.get('/', categoryController.getCategories);
    router.get('/:id', validateRequest(paramsIdSchema), categoryController.getCategoryById);
    router.post('/', validateRequest(createCategorySchema), categoryController.createCategory);
    router.delete('/:id', validateRequest(paramsIdSchema), categoryController.deleteCategory);
    router.patch('/:id', validateRequest(updateCategorySchema), categoryController.updateCategory);

    return router;
  }
}
