import express, { type Router } from 'express';

export interface ServerOptions {
  port: number;
  router: Router;
}

export class Server {
  private app = express();
  private port: number;
  private router: Router;

  constructor(options: ServerOptions) {
    this.port = options.port;
    this.router = options.router;
  }

  async run() {
    // Native express middlewares
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Routes
    this.app.use('/api', this.router);

    this.app.listen(this.port, () => {
      console.log(`Server is running on port ${this.port}`);
    });
  }
}
