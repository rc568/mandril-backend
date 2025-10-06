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
    router.get('/:id', validateRequest({ params: paramsIdSchema }), categoryController.getCategoryById);
    router.post('/', validateRequest({ body: createCategorySchema }), categoryController.createCategory);
    router.patch(
      '/:id',
      validateRequest({ params: paramsIdSchema, body: updateCategorySchema }),
      categoryController.updateCategory,
    );
    router.delete('/:id', validateRequest({ params: paramsIdSchema }), categoryController.deleteCategory);

    return router;
  }
}
