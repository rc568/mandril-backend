import { sql } from 'drizzle-orm';

export const searchClientsQuery = (query: string) => {
  const searchTerm = `%${query}%`;

  return sql`
    SELECT DISTINCT ON (bo.billing_name, bo.billing_document_number)
      c.id AS "clientId",
      c.document_number_type AS "documentNumberType",
      c.document_number AS "documentNumber",
      c.contact_name AS "contactName",
      c.email,
      c.phone_number1 AS "phoneNumber1",
      c.phone_number2 AS "phoneNumber2",
      bo.billing_name AS "billingName",
      bo.billing_receipt_type AS "billingReceiptType",
      bo.billing_document_number_type AS "billingDocumentNumberType",
      bo.billing_document_number AS "billingDocumentNumber"
    FROM
      client c
    INNER JOIN "order" o ON o.client_id = c.id
    INNER JOIN billing_orders bo ON bo.order_id = o.id
    WHERE
      c.document_number ILIKE ${searchTerm}
      OR c.contact_name ILIKE ${searchTerm}
      OR c.phone_number1 ILIKE ${searchTerm}
      OR c.phone_number2 ILIKE ${searchTerm}
      OR bo.billing_name ILIKE ${searchTerm}
      OR bo.billing_document_number ILIKE ${searchTerm}
    ORDER BY
      bo.billing_name, bo.billing_document_number, c.created_at
    LIMIT 10;
    `;
};
