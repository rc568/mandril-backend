import { routerApp } from './api/router';
import { Server, type ServerOptions } from './api/server';
import envs from './config/envs';

(async () => {
  main();
})();

async function main() {
  const options: ServerOptions = {
    port: envs.PORT,
    router: routerApp(),
  };

  const app = new Server(options);

  app.run();
}
