import type { Request, Response } from 'express';
import type { ClientService } from './client.service';

export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  getSearchClients = async (req: Request, res: Response) => {
    const clients = await this.clientService.searchClients(req.validatedQuery);
    res.sendSuccess({ data: clients });
  };
}
