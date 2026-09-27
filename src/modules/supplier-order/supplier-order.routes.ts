import { Router } from 'express';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import {
  createSupplierOrderSchema,
  getSupplierOrdersQuerySchema,
  updateSupplierOrderSchema,
} from './schemas/supplier-order.schema';
import {
  createSupplierOrderExpenseSchema,
  supplierOrderExpenseParamsSchema,
  supplierOrderExpensesParamsSchema,
  updateSupplierOrderExpenseSchema,
} from './schemas/supplier-order-expense.schema';
import { SupplierOrderController } from './supplier-order.controller';
import { SupplierOrderService } from './supplier-order.service';
import { SupplierOrderExpenseController } from './supplier-order-expense.controller';
import { SupplierOrderExpenseService } from './supplier-order-expense.service';

export class SupplierOrderRouter {
  static create() {
    const router = Router();
    const controller = new SupplierOrderController(new SupplierOrderService());
    const expenseController = new SupplierOrderExpenseController(new SupplierOrderExpenseService());

    router.use(adminEmployeeAccess);
    router.get('/', validateRequest({ query: getSupplierOrdersQuerySchema }), controller.getOrders);
    router.get('/:id', validateRequest({ params: paramsUuidv4IdSchema }), controller.getOrderById);
    router.post('/', validateRequest({ body: createSupplierOrderSchema }), controller.createOrder);
    router.patch(
      '/:id',
      validateRequest({ params: paramsUuidv4IdSchema, body: updateSupplierOrderSchema }),
      controller.updateOrder,
    );
    router.post('/:id/in-transit', validateRequest({ params: paramsUuidv4IdSchema }), controller.markInTransit);
    router.post('/:id/cancel', validateRequest({ params: paramsUuidv4IdSchema }), controller.cancelOrder);

    router.post(
      '/:orderId/expenses',
      validateRequest({ params: supplierOrderExpensesParamsSchema, body: createSupplierOrderExpenseSchema }),
      expenseController.createExpense,
    );
    router.patch(
      '/:orderId/expenses/:expenseId',
      validateRequest({ params: supplierOrderExpenseParamsSchema, body: updateSupplierOrderExpenseSchema }),
      expenseController.updateExpense,
    );
    router.delete(
      '/:orderId/expenses/:expenseId',
      validateRequest({ params: supplierOrderExpenseParamsSchema }),
      expenseController.deleteExpense,
    );

    return router;
  }
}
