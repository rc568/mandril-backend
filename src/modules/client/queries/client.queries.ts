import { sql } from 'drizzle-orm';

export const searchClientsQuery = (query: string) => {
  const searchTerm = `%${query}%`;

  return sql`
    SELECT DISTINCT ON (c.document_number, c.bussiness_name)
      c.document_number,
      c.bussiness_name,
      c.contact_name,
      c.email,
      c.phone_number1
    FROM
      client c
      INNER JOIN "order" o ON c.id = o.client_id
    WHERE
      c.document_number IS NOT NULL
      AND c.bussiness_name IS NOT NULL
      AND (
            c.bussiness_name ILIKE ${searchTerm}
        OR c.document_number ILIKE ${searchTerm}
        OR c.contact_name ILIKE ${searchTerm}
        OR c.phone_number1 ILIKE ${searchTerm}
      )
    ORDER BY
      c.document_number,
      c.bussiness_name,
      o.created_at DESC
    LIMIT 10;
    `;
};
