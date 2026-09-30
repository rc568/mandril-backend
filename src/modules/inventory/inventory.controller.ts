import type { Request, Response } from 'express';
import { requireAuth } from '@/shared/auth';
import type { InventoryAdjustmentService } from './inventory-adjustment.service';
import type { InventoryQueryService } from './inventory-query.service';

export class InventoryController {
  constructor(
    private readonly adjustmentService: InventoryAdjustmentService,
    private readonly queryService: InventoryQueryService,
  ) {}

  getBalances = async (req: Request, res: Response) => {
    res.sendSuccess({ data: await this.queryService.getBalances(req.validatedQuery) });
  };

  getMovements = async (req: Request, res: Response) => {
    res.sendSuccess({ data: await this.queryService.getMovements(req.validatedQuery) });
  };

  adjust = async (req: Request, res: Response) => {
    requireAuth(req);
    const result = await this.adjustmentService.adjust(req.validatedBody, req.user.id);
    res.sendSuccess({ data: result });
  };
}
