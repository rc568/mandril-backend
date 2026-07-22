import { db } from '@/shared/db';
import { searchClientsQuery } from './queries/client.queries';

export class ClientService {
  searchClients = async ({ q }: { q: string }) => {
    if (!q || q.trim() === '') return [];

    const { rows: clients } = await db.execute(searchClientsQuery(q));
    return clients;
  };
}
