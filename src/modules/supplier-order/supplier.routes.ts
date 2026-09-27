import { Router } from 'express';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import { createSupplierSchema, getSuppliersQuerySchema, updateSupplierSchema } from './schemas/supplier.schema';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';

export class SupplierRouter {
  static create() {
    const router = Router();
    const controller = new SupplierController(new SupplierService());

    router.use(adminEmployeeAccess);
    router.get('/', validateRequest({ query: getSuppliersQuerySchema }), controller.getSuppliers);
    router.get('/:id', validateRequest({ params: paramsUuidv4IdSchema }), controller.getSupplierById);
    router.post('/', validateRequest({ body: createSupplierSchema }), controller.createSupplier);
    router.patch(
      '/:id',
      validateRequest({ params: paramsUuidv4IdSchema, body: updateSupplierSchema }),
      controller.updateSupplier,
    );

    return router;
  }
}
