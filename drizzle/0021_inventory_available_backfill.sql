-- Development transition: copy the agreed stock source without generating movements.
INSERT INTO "inventory_balance" ("product_variant_id", "bucket", "quantity", "updated_at", "updated_by")
SELECT "id", 'AVAILABLE', GREATEST("quantity_in_stock", 0), CURRENT_TIMESTAMP, COALESCE("updated_by", "created_by")
FROM "product_variant"
ON CONFLICT ("product_variant_id", "bucket") DO UPDATE
SET "quantity" = EXCLUDED."quantity", "updated_at" = EXCLUDED."updated_at", "updated_by" = EXCLUDED."updated_by";
