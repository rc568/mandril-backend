import { db } from '@/shared/db';
import { z } from '@/shared/libs';
import { migrateLegacyInventory } from './legacy-inventory';

async function main() {
  const [userId, mode = '--preview', ...extra] = process.argv.slice(2);
  if (!z.uuidv4().safeParse(userId).success || !['--preview', '--apply'].includes(mode) || extra.length > 0)
    throw new Error('Uso: pnpm inventory:migrate <user-uuid> [--preview|--apply]');
  console.log(JSON.stringify(await migrateLegacyInventory(userId, mode === '--apply'), null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'La migración falló.');
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
