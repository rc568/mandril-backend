import { Router } from 'express';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { validateRequest } from '@/shared/middlewares';
import { paramsUuidv4IdSchema } from '@/shared/validators';
import {
  createSupplierOrderSchema,
  getSupplierOrdersQuerySchema,
  supplierOrderActionSchema,
  updateProjectedExchangeRateSchema,
  updateSupplierOrderSchema,
} from './schemas/supplier-order.schema';
import {
  createSupplierOrderExpenseSchema,
  supplierOrderExpenseParamsSchema,
  supplierOrderExpensesParamsSchema,
  updateSupplierOrderExpenseSchema,
} from './schemas/supplier-order-expense.schema';
import {
  closeSupplierOrderIssueSchema,
  createSupplierOrderIssueSchema,
  supplierOrderIssueParamsSchema,
  supplierOrderIssuesParamsSchema,
} from './schemas/supplier-order-issue.schema';
import {
  createSupplierOrderReceiptSchema,
  reviewSupplierOrderReceiptSchema,
  supplierOrderReceiptParamsSchema,
  supplierOrderReceiptsParamsSchema,
} from './schemas/supplier-order-receipt.schema';
import { SupplierOrderController } from './supplier-order.controller';
import { SupplierOrderService } from './supplier-order.service';
import { SupplierOrderCostController } from './supplier-order-cost.controller';
import { SupplierOrderCostService } from './supplier-order-cost.service';
import { SupplierOrderExpenseController } from './supplier-order-expense.controller';
import { SupplierOrderExpenseService } from './supplier-order-expense.service';
import { SupplierOrderIssueController } from './supplier-order-issue.controller';
import { SupplierOrderIssueService } from './supplier-order-issue.service';
import { SupplierOrderReceiptController } from './supplier-order-receipt.controller';
import { SupplierOrderReceiptService } from './supplier-order-receipt.service';
import { SupplierOrderReceiptReviewService } from './supplier-order-receipt-review.service';

export class SupplierOrderRouter {
  static create() {
    const router = Router();
    const controller = new SupplierOrderController(new SupplierOrderService());
    const expenseController = new SupplierOrderExpenseController(new SupplierOrderExpenseService());
    const receiptController = new SupplierOrderReceiptController(
      new SupplierOrderReceiptService(),
      new SupplierOrderReceiptReviewService(),
    );
    const issueController = new SupplierOrderIssueController(new SupplierOrderIssueService());
    const costController = new SupplierOrderCostController(new SupplierOrderCostService());

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
    router.patch(
      '/:id/projected-exchange-rate',
      validateRequest({ params: paramsUuidv4IdSchema, body: updateProjectedExchangeRateSchema }),
      controller.updateProjectedExchangeRate,
    );

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

    router.get(
      '/:orderId/receipts',
      validateRequest({ params: supplierOrderReceiptsParamsSchema }),
      receiptController.getReceipts,
    );
    router.get(
      '/:orderId/receipts/:receiptId',
      validateRequest({ params: supplierOrderReceiptParamsSchema }),
      receiptController.getReceiptById,
    );
    router.post(
      '/:orderId/receipts',
      validateRequest({
        params: supplierOrderReceiptsParamsSchema,
        body: createSupplierOrderReceiptSchema,
        allowEmptyBody: true,
      }),
      receiptController.createReceipt,
    );
    router.post(
      '/:orderId/receipts/:receiptId/review',
      validateRequest({ params: supplierOrderReceiptParamsSchema, body: reviewSupplierOrderReceiptSchema }),
      receiptController.reviewReceipt,
    );
    router.post(
      '/:orderId/receipts/:receiptId/post-to-inventory',
      validateRequest({
        params: supplierOrderReceiptParamsSchema,
        body: supplierOrderActionSchema,
        allowEmptyBody: true,
      }),
      receiptController.postToInventory,
    );
    router.post(
      '/:orderId/close-receiving',
      validateRequest({
        params: supplierOrderReceiptsParamsSchema,
        body: supplierOrderActionSchema,
        allowEmptyBody: true,
      }),
      receiptController.closeReceiving,
    );
    router.post(
      '/:orderId/calculate-costs',
      validateRequest({
        params: supplierOrderReceiptsParamsSchema,
        body: supplierOrderActionSchema,
        allowEmptyBody: true,
      }),
      costController.calculateCosts,
    );
    router.get(
      '/:orderId/issues',
      validateRequest({ params: supplierOrderIssuesParamsSchema }),
      issueController.getIssues,
    );
    router.post(
      '/:orderId/issues',
      validateRequest({ params: supplierOrderIssuesParamsSchema, body: createSupplierOrderIssueSchema }),
      issueController.createIssue,
    );
    router.post(
      '/:orderId/issues/:issueId/close',
      validateRequest({ params: supplierOrderIssueParamsSchema, body: closeSupplierOrderIssueSchema }),
      issueController.closeIssue,
    );

    return router;
  }
}
