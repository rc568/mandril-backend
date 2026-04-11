import { routerApp, Server, type ServerOptions } from '@/app';
import envs from './config/envs';
import { checkConnection } from './shared/db';

(async () => {
  main();
})();

async function main() {
  const options: ServerOptions = {
    port: envs.PORT,
    router: routerApp(),
  };

  await checkConnection();
  const app = new Server(options);

  app.run();
}
