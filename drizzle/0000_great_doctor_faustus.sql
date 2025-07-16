CREATE TABLE "category" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"parent_id" smallint
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"product_id" smallint
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"code" char(5) NOT NULL,
	"description" text,
	"price" numeric(12, 6) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"category_id" smallint,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "product_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;