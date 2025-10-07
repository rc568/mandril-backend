import type { Request, Response } from 'express';
import { requireAuth } from '../utils';
import type { SeedService } from './seed.service';

export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  execute = async (req: Request, res: Response) => {
    requireAuth(req);
    const data = await this.seedService.execute(req.user.id);
    res.status(200).json(data);
  };
}
