import type { Request, Response } from 'express';
import type { SeedService } from './seed.service';

export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  execute = async (_req: Request, res: Response) => {
    const data = await this.seedService.execute();
    res.status(200).json(data);
  };
}
