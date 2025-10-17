import { Router } from 'express';
import { CategoryController } from '../controllers';
import { validateRequest } from '../middlewares';
import { CategoryService } from '../services';
import { adminAccess, adminEmployeeAccess } from '../utils/auth-access';
import { createCategorySchema, deleteCategoryQuerySchema, paramsIdSchema, updateCategorySchema } from '../validators';

export class CategoryRouter {
  static create() {
    const router = Router();
    const categoryService = new CategoryService();
    const categoryController = new CategoryController(categoryService);

    router.get('/', categoryController.getCategories);
    router.get('/:id', validateRequest({ params: paramsIdSchema }), categoryController.getCategoryById);
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createCategorySchema }),
      categoryController.createCategory,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: updateCategorySchema }),
      categoryController.updateCategory,
    );
    router.delete(
      '/:id',
      adminAccess,
      validateRequest({ params: paramsIdSchema, query: deleteCategoryQuerySchema }),
      categoryController.deleteCategory,
    );

    return router;
  }
}
