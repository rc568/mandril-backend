import { Router } from 'express';
import { adminEmployeeAccess } from '@/shared/auth/auth-access';
import { z } from '@/shared/libs';
import { validateRequest } from '@/shared/middlewares';
import { ClientController } from './client.controller';
import { ClientService } from './client.service';

export class ClientRouter {
  static create() {
    const router = Router();
    const clientService = new ClientService();
    const clientController = new ClientController(clientService);

    router.get(
      '/search',
      adminEmployeeAccess,
      validateRequest({ query: z.object({ q: z.string().optional() }) }),
      clientController.getSearchClients,
    );
    return router;
  }
}
