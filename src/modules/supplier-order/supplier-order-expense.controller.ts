import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierOrderExpenseService } from './supplier-order-expense.service';

export class SupplierOrderExpenseController {
  constructor(private readonly expenseService: SupplierOrderExpenseService) {}

  createExpense = async (req: Request, res: Response) => {
    requireAuth(req);
    const expense = await this.expenseService.create(req.validatedParams.orderId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: expense, statusCode: 201 });
  };

  updateExpense = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId, expenseId } = req.validatedParams;
    const expense = await this.expenseService.update(orderId, expenseId, req.validatedBody, req.user.id);
    res.sendSuccess({ data: expense });
  };

  deleteExpense = async (req: Request, res: Response) => {
    requireAuth(req);
    const { orderId, expenseId } = req.validatedParams;
    await this.expenseService.delete(orderId, expenseId, req.user.id);
    res.sendSuccess({ data: null });
  };
}
