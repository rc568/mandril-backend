import type { Request, Response } from 'express';
import type { StatsService } from '../services/stats.service';

export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  getInventoryStats = async (_req: Request, res: Response) => {
    const stats = await this.statsService.inventory();
    res.sendSuccess({ data: stats });
  };

  getRankingProducts = async (req: Request, res: Response) => {
    const stats = await this.statsService.rankingProducts(req.validatedQuery);
    res.sendSuccess({ data: stats });
  };

  getColdProducts = async (req: Request, res: Response) => {
    const stats = await this.statsService.coldProducts(req.validatedQuery);
    res.sendSuccess({ data: stats });
  };

  getSalesSummary = async (req: Request, res: Response) => {
    const stats = await this.statsService.salesSummary(req.validatedQuery);
    res.sendSuccess({ data: stats });
  };
}
