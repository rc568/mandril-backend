import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { SupplierOrderCostService } from './supplier-order-cost.service';

export class SupplierOrderCostController {
  constructor(private readonly costService: SupplierOrderCostService) {}

  calculateCosts = async (req: Request, res: Response) => {
    requireAuth(req);
    const costs = await this.costService.calculateAndSave(req.validatedParams.orderId, req.user.id);
    res.sendSuccess({ data: costs });
  };
}
