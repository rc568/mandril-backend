import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Router } from 'express';
import { errorHandler } from './middlewares';
import { sendError, sendSuccess } from './utils/api-response';

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
    this.app.use(
      cors({
        origin: ['http://localhost:5173', 'http://localhost:5174'],
      }),
    );

    // Native express middlewares
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cookieParser());

    // Custom response methods
    this.app.response.sendSuccess = sendSuccess;
    this.app.response.sendError = sendError;

    // Routes
    this.app.use('/api', this.router);
    this.app.use(errorHandler);

    this.app.listen(this.port, () => {
      console.log(`Server is running on port ${this.port}`);
    });
  }
}
