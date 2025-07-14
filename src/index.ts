import 'reflect-metadata';
import { routerApp } from './api/router';
import { Server, type ServerOptions } from './api/server';
import envs from './config/envs';
import { AppDataSource } from './db/typeorm/db';

(async () => {
  main();
})();

async function main() {
  AppDataSource.initialize()
    .then(() => {
      console.log('Database connection established successfully');
    })
    .catch((error) => {
      console.error('Error during Data Source initialization:', error);
    });

  const options: ServerOptions = {
    port: envs.PORT,
    router: routerApp(),
  };

  const app = new Server(options);

  app.run();
}
