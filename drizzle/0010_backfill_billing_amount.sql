UPDATE billing_orders bo
SET amount = o.total_sale
FROM "order" o
WHERE o.id = bo.order_id
  AND bo.amount IS NULL;