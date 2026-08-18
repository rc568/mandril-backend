CREATE TYPE "public"."document_number_type" AS ENUM('SIN DOCUMENTO', 'CARNE DE EXTRANJERIA', 'PASAPORTE', 'DNI', 'RUC', 'OTRO');--> statement-breakpoint
ALTER TYPE "public"."billing_document_type" RENAME TO "receipt_type";--> statement-breakpoint
ALTER TABLE "billing_orders" RENAME COLUMN "billing_document_type" TO "billing_receipt_type";--> statement-breakpoint
ALTER TABLE "billing_orders" ADD COLUMN "billing_document_number_type" "document_number_type" NOT NULL;