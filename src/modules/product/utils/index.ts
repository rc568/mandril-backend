import { type SQL, sql } from 'drizzle-orm';

export const productOrderByMap: Record<string, SQL> = {
  default: sql`prod.name ASC`,
  name_asc: sql`prod.name ASC`,
  name_desc: sql`prod.name DESC`,
};
