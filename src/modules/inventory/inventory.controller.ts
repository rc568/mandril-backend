import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { InventoryAdjustmentService } from './inventory-adjustment.service';

export class InventoryController {
  constructor(private readonly adjustmentService: InventoryAdjustmentService) {}

  adjust = async (req: Request, res: Response) => {
    requireAuth(req);
    const result = await this.adjustmentService.adjust(req.validatedBody, req.user.id);
    res.sendSuccess({ data: result });
  };
}
