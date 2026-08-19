ALTER TABLE "client" DROP COLUMN "document_type";--> statement-breakpoint
ALTER TABLE "client" DROP COLUMN "bussiness_name";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "invoice_type";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "invoice_code";--> statement-breakpoint
DROP TYPE "public"."document_type";--> statement-breakpoint
DROP TYPE "public"."invoice_type";