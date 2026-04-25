import { Router } from 'express';
import { adminAccess, adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsIdSchema } from '@/shared/validators';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { createCatalogSchema, deleteCatalogQuerySchema, updateCatalogSchema } from './schemas/catalog.schema';

export class CatalogRouter {
  static create() {
    const router = Router();
    const catalogService = new CatalogService();
    const catalogController = new CatalogController(catalogService);

    router.get('/', catalogController.getCatalogs);
    router.get('/:id', validateRequest({ params: paramsIdSchema }), catalogController.getCatalogById);
    router.post(
      '/',
      adminEmployeeAccess,
      validateRequest({ body: createCatalogSchema }),
      catalogController.createCategory,
    );
    router.patch(
      '/:id',
      adminEmployeeAccess,
      validateRequest({ params: paramsIdSchema, body: updateCatalogSchema }),
      catalogController.updateCatalog,
    );
    router.delete(
      '/:id',
      adminAccess,
      validateRequest({ params: paramsIdSchema, query: deleteCatalogQuerySchema }),
      catalogController.softDeleteCatalog,
    );

    return router;
  }
}
