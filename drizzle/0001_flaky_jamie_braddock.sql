ALTER TABLE "variant_option_values" RENAME TO "variant_attribute_map";--> statement-breakpoint
ALTER TABLE "product_options" RENAME TO "variant_attribute";--> statement-breakpoint
ALTER TABLE "option_values" RENAME TO "variant_attribute_values";--> statement-breakpoint
ALTER TABLE "variant_attribute_values" RENAME COLUMN "product_option_id" TO "variant_attribute_id";--> statement-breakpoint
ALTER TABLE "variant_attribute_map" RENAME COLUMN "option_value_id" TO "variant_value_id";--> statement-breakpoint
ALTER TABLE "variant_attribute_values" DROP CONSTRAINT "option_values_product_option_id_product_options_id_fk";
--> statement-breakpoint
ALTER TABLE "variant_attribute_map" DROP CONSTRAINT "variant_option_values_option_value_id_option_values_id_fk";
--> statement-breakpoint
ALTER TABLE "variant_attribute_map" DROP CONSTRAINT "variant_option_values_product_variant_id_product_variant_id_fk";
--> statement-breakpoint
ALTER TABLE "variant_attribute_map" DROP CONSTRAINT "variant_option_values_option_value_id_product_variant_id_pk";--> statement-breakpoint
ALTER TABLE "variant_attribute_map" ADD CONSTRAINT "variant_attribute_map_variant_value_id_product_variant_id_pk" PRIMARY KEY("variant_value_id","product_variant_id");--> statement-breakpoint
ALTER TABLE "variant_attribute_values" ADD CONSTRAINT "variant_attribute_values_variant_attribute_id_variant_attribute_id_fk" FOREIGN KEY ("variant_attribute_id") REFERENCES "public"."variant_attribute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_map" ADD CONSTRAINT "variant_attribute_map_variant_value_id_variant_attribute_values_id_fk" FOREIGN KEY ("variant_value_id") REFERENCES "public"."variant_attribute_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_map" ADD CONSTRAINT "variant_attribute_map_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;