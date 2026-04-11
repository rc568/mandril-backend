import { db } from '../client';

export const checkConnection = async () => {
  try {
    await db.execute('SELECT 1');
  } catch (error) {
    console.error(error);
    console.error('Error connecting to database...');
    process.exit(1);
  }
};
