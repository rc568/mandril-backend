ALTER TABLE "product" ALTER COLUMN "updated_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "created_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "deleted_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_variant" ALTER COLUMN "updated_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_variant" ALTER COLUMN "created_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_variant" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variant" ALTER COLUMN "deleted_by" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;