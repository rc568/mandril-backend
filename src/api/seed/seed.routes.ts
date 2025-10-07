import { Router } from 'express';
import { adminEmployeeAccess } from '../utils/auth-access';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

export class SeedRouter {
  static create() {
    const router = Router();
    const seedService = new SeedService();
    const seedController = new SeedController(seedService);

    router.get('/', adminEmployeeAccess, seedController.execute);

    return router;
  }
}
