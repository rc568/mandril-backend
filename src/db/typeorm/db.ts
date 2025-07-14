import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: '123456',
  database: 'mandril_db',
  logging: true,
  entities: ['src/database/typeorm/entities/*.entity.ts', 'dist/database/typeorm/entities/*.entity.ts'],
  synchronize: true,
  migrationsTableName: 'migrations_table',
});
