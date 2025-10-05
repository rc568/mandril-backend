ALTER TABLE "product" ADD COLUMN "updated_by" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "created_by" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "deleted_by" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "updated_by" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "created_by" uuid DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "deleted_by" uuid DEFAULT gen_random_uuid();