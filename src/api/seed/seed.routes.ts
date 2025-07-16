import { Router } from 'express';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

export class SeedRouter {
  static create() {
    const router = Router();
    const seedService = new SeedService();
    const seedController = new SeedController(seedService);

    router.get('/', (req, res) => seedController.execute(req, res));

    return router;
  }
}
