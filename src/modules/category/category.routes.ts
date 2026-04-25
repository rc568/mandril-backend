import { Router } from 'express';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsIdSchema } from '@/shared/validators';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { createCategorySchema, deleteCategoryQuerySchema, updateCategorySchema } from './schemas/category.schema';

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
      categoryController.softDeleteCategory,
    );

    return router;
  }
}
