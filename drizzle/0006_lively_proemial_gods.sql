CREATE TYPE "public"."document_client_number_type" AS ENUM('CARNE DE EXTRANJERIA', 'PASAPORTE', 'DNI', 'OTRO');--> statement-breakpoint
ALTER TABLE "billing_orders" ALTER COLUMN "billing_document_number_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."document_number_type";--> statement-breakpoint
CREATE TYPE "public"."document_number_type" AS ENUM('CARNE DE EXTRANJERIA', 'PASAPORTE', 'DNI', 'OTRO', 'SIN DOCUMENTO', 'RUC');--> statement-breakpoint
ALTER TABLE "billing_orders" ALTER COLUMN "billing_document_number_type" SET DATA TYPE "public"."document_number_type" USING "billing_document_number_type"::"public"."document_number_type";--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "document_number_type" "document_client_number_type";