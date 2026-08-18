INSERT INTO
  "billing_orders" (
    order_id,
    code,
    status,
    billing_receipt_type,
    billing_document_number,
    billing_document_number_type,
    billing_name,
    created_at,
    created_by
  )
select
  o.id as "order_id",
  o.invoice_code as "code",
  'ISSUED'::text::billing_status as "status",
  o.invoice_type::text::receipt_type as "billing_receipt_type",
  c.document_number as "billing_document_number",
  c.document_type::text::document_number_type as "billing_document_number_type",
  UPPER(c.bussiness_name) as "billing_name",
  o.created_at,
  o.created_by
from
  "order" o
  inner join "client" c on o.client_id = c.id
where
  o.invoice_type <> 'SIN COMPROBANTE';
