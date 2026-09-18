ALTER TABLE "order_products" DROP CONSTRAINT "order_products_order_id_product_variant_id_type_pk";--> statement-breakpoint
ALTER TABLE "order_products" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_product_variant_by_type_order" ON "order_products" USING btree ("order_id","product_variant_id","type");