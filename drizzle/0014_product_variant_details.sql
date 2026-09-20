ALTER TABLE "product_variant" ADD COLUMN "warranty_months" integer;--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "length_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "width_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "height_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "weight_grams" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "package_length_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "package_width_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "package_height_cm" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "stock_alert_threshold" integer;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_warranty_months_check" CHECK ("product_variant"."warranty_months" >= 0);--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_stock_alert_threshold_check" CHECK ("product_variant"."stock_alert_threshold" >= 0);--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_measurements_check" CHECK ("product_variant"."length_cm" > 0 AND "product_variant"."width_cm" > 0 AND "product_variant"."height_cm" > 0 AND "product_variant"."weight_grams" > 0 AND "product_variant"."package_length_cm" > 0 AND "product_variant"."package_width_cm" > 0 AND "product_variant"."package_height_cm" > 0);