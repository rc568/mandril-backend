CREATE TABLE "sku_counter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prefix" varchar(8) NOT NULL,
	"value" integer NOT NULL,
	"description" varchar(80),
	"updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "sku_counter_prefix_unique" UNIQUE("prefix")
);
