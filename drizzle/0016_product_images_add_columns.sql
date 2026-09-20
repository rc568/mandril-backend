ALTER TABLE "product_images" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "is_primary" boolean;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;