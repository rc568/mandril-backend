-- Development only. Run before the inventory transition, with a verified backup.
-- Enable explicitly using PGOPTIONS='-c app.allow_test_order_cleanup=true'.
BEGIN;
DO $$
BEGIN
  IF current_setting('app.allow_test_order_cleanup', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Development order cleanup must be explicitly enabled.';
  END IF;
END;
$$;

CREATE TEMP TABLE test_order_ids ON COMMIT DROP AS
SELECT id FROM "order" WHERE status IN ('PENDING', 'PAID');

-- Never remove completed/cancelled descendants implicitly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "order" WHERE related_order_id IN (SELECT id FROM test_order_ids)
             AND id NOT IN (SELECT id FROM test_order_ids)) THEN
    RAISE EXCEPTION 'A retained order references a test order; resolve it before cleanup.';
  END IF;
END;
$$;

DELETE FROM billing_orders WHERE order_id IN (SELECT id FROM test_order_ids);
DELETE FROM stock_movement WHERE order_id IN (SELECT id FROM test_order_ids);
DELETE FROM order_products WHERE order_id IN (SELECT id FROM test_order_ids);
DELETE FROM "order" WHERE id IN (SELECT id FROM test_order_ids);
COMMIT;
