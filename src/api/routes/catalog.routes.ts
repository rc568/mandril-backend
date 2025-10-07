import { Router } from 'express';
import { CatalogController } from '../controllers';
import { validateRequest } from '../middlewares';
import { CatalogService } from '../services/catalog.service';
import { adminAccess, adminEmployeeAccess } from '../utils/auth-access';
import { createCatalogSchema, deleteCatalogQuerySchema, paramsIdSchema, updateCatalogSchema } from '../validators';

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
      catalogController.deleteCatalog,
    );

    return router;
  }
}
