import { inject } from 'vitest';

// Se ejecuta antes de importar la aplicación. Nunca usamos DATABASE_URL de .env.
process.env.DOTENV_CONFIG_PATH = '/dev/null';
process.env.DATABASE_URL = inject('databaseUrl') ?? 'postgresql://unused:unused@127.0.0.1:1/never_connect';
process.env.NODE_ENV = 'production';
process.env.PORT = '3000';
process.env.PUBLIC_URL = 'http://localhost:3000';
process.env.JWT_SECRET_KEY = 'product-tests-access-secret';
process.env.JWT_REFRESH_SECRET_KEY = 'product-tests-refresh-secret';
process.env.JWT_DURATION = '1h';
process.env.JWT_REFRESH_DURATION = '1d';

// Ningún test debe heredar las credenciales del bucket real.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('STORAGE_') || key.startsWith('AWS_')) delete process.env[key];
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    databaseToken: string;
  }
}
