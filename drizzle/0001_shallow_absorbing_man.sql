CREATE TYPE "public"."billing_document_type" AS ENUM('FACTURA', 'BOLETA');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('PENDING', 'ISSUED', 'VOIDED');--> statement-breakpoint
CREATE TABLE "billing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"code" varchar(50),
	"status" "billing_status" DEFAULT 'PENDING' NOT NULL,
	"billing_document_type" "billing_document_type" NOT NULL,
	"billing_document_number" varchar(25),
	"billing_name" varchar(255) NOT NULL,
	"billing_address" varchar(255),
	"note" text
);
--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;