import { sql } from 'drizzle-orm';

export const searchClientsQuery = (query: string) => {
  const searchTerm = `%${query}%`;

  return sql`
    SELECT DISTINCT ON (c.document_number, c.bussiness_name)
      c.id AS "clientId",
      c.document_type AS "documentType",
      c.document_number AS "documentNumber",
      c.bussiness_name AS "bussinessName",
      c.contact_name AS "contactName",
      c.email,
      c.phone_number1 AS "phoneNumber1",
      c.phone_number2 AS "phoneNumber2"
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
        OR c.phone_number2 ILIKE ${searchTerm}
      )
    ORDER BY
      c.document_number,
      c.bussiness_name,
      o.created_at DESC
    LIMIT 10;
    `;
};
