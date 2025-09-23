DROP INDEX "productVariantToValueIndex";--> statement-breakpoint
ALTER TABLE "product_variant_to_value" ADD COLUMN "variant_attribute_id" smallint;--> statement-breakpoint
ALTER TABLE "product_variant_to_value" ADD CONSTRAINT "product_variant_to_value_variant_attribute_id_variant_attribute_id_fk" FOREIGN KEY ("variant_attribute_id") REFERENCES "public"."variant_attribute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "productVariantToAttributeIndex" ON "product_variant_to_value" USING btree ("product_variant_id","variant_attribute_id");