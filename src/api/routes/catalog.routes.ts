import { Router } from 'express';
import { CatalogController } from '../controllers';
import { validateRequest } from '../middlewares';
import { CatalogService } from '../services/catalog.service';
import { createCatalogSchema, paramsIdSchema, updateCatalogSchema } from '../validators';

export class CatalogRouter {
  static create() {
    const router = Router();
    const catalogService = new CatalogService();
    const catalogController = new CatalogController(catalogService);

    router.get('/', catalogController.getCatalogs);
    router.get('/:id', validateRequest(paramsIdSchema), catalogController.getCatalogById);
    router.post('/', validateRequest(createCatalogSchema), catalogController.createCategory);
    router.delete('/:id', validateRequest(paramsIdSchema), catalogController.deleteCatalog);
    router.patch('/:id', validateRequest(updateCatalogSchema), catalogController.updateCatalog);

    return router;
  }
}
