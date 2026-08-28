CREATE TYPE "public"."document_type" AS ENUM('SIN DOCUMENTO', 'CARNE DE EXTRANJERIA', 'PASAPORTE', 'DNI', 'RUC', 'OTRO');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('FACTURA', 'BOLETA', 'SIN COMPROBANTE');--> statement-breakpoint
CREATE TYPE "public"."order_product_type" AS ENUM('SALE', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."order_type" AS ENUM('SALE', 'EXCHANGE', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('SALE', 'RETURN', 'PURCHASE', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_status" AS ENUM('En camino', 'Recibido', 'Cancelado');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('superadmin', 'admin', 'employee', 'customer');--> statement-breakpoint
CREATE TABLE "catalog" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid,
	CONSTRAINT "catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"parent_id" smallint,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "client" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_type" "document_type",
	"document_number" varchar(25),
	"bussiness_name" varchar(255),
	"contact_name" varchar(255),
	"email" varchar(255),
	"phone_number1" varchar(25),
	"phone_number2" varchar(25),
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_products" (
	"order_id" uuid NOT NULL,
	"product_variant_id" smallint NOT NULL,
	"type" "order_product_type" DEFAULT 'SALE' NOT NULL,
	"price" numeric(12, 6) NOT NULL,
	"quantity" integer NOT NULL,
	"purchase_price" numeric(12, 6) NOT NULL,
	CONSTRAINT "order_products_order_id_product_variant_id_type_pk" PRIMARY KEY("order_id","product_variant_id","type")
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "order_type" DEFAULT 'SALE' NOT NULL,
	"related_order_id" uuid,
	"sales_channel_id" smallint NOT NULL,
	"invoice_type" "invoice_type",
	"invoice_code" varchar(50),
	"client_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'PAID' NOT NULL,
	"total_sale" numeric(12, 6) NOT NULL,
	"total_cost" numeric(12, 6) NOT NULL,
	"num_products" integer NOT NULL,
	"observation" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_channel" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"channel" varchar(25) NOT NULL,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid,
	CONSTRAINT "sales_channel_channel_unique" UNIQUE("channel")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"product_variant_id" smallint,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"category_id" smallint,
	"catalog_id" smallint,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid,
	CONSTRAINT "product_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_to_variant_attribute" (
	"product_id" smallint NOT NULL,
	"variant_attribute_id" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variant" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"code" char(5) NOT NULL,
	"price" numeric(12, 6) NOT NULL,
	"purchase_price" numeric(12, 6) NOT NULL,
	"quantity_in_stock" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true,
	"product_id" smallint NOT NULL,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid,
	CONSTRAINT "product_variant_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_variant_to_value" (
	"product_variant_id" smallint NOT NULL,
	"variant_attribute_value_id" smallint NOT NULL,
	"variant_attribute_id" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_attribute" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"name" varchar(30) NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_attribute_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "variant_attribute_value" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"value" varchar(35) NOT NULL,
	"variant_attribute_id" smallint,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sku_counter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prefix" varchar(8) NOT NULL,
	"value" integer NOT NULL,
	"description" varchar(80),
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "sku_counter_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_variant_id" smallint NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"order_id" uuid,
	"purchase_id" uuid,
	"note" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_by" uuid,
	"created_by" uuid NOT NULL,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "supplier_order_product" (
	"supplier_order_id" uuid NOT NULL,
	"product_variant_id" smallint NOT NULL,
	"purchase_price" numeric(12, 6) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "supplier_order_product_supplier_order_id_product_variant_id_pk" PRIMARY KEY("supplier_order_id","product_variant_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_order" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guide" varchar(20) NOT NULL,
	"import_policy" varchar(20) NOT NULL,
	"supplier_id" uuid,
	"status" "supplier_order_status" DEFAULT 'En camino' NOT NULL,
	"observation" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password" varchar(128) NOT NULL,
	"user_name" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_email_verified" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'employee' NOT NULL,
	"refresh_token" varchar,
	"updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_userName_unique" UNIQUE("user_name"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog" ADD CONSTRAINT "catalog_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_products" ADD CONSTRAINT "order_products_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_related_order_id_order_id_fk" FOREIGN KEY ("related_order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_sales_channel_id_sales_channel_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_channel" ADD CONSTRAINT "sales_channel_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_channel" ADD CONSTRAINT "sales_channel_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_channel" ADD CONSTRAINT "sales_channel_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_catalog_id_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalog"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_to_variant_attribute" ADD CONSTRAINT "product_to_variant_attribute_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_to_variant_attribute" ADD CONSTRAINT "product_to_variant_attribute_variant_attribute_id_variant_attribute_id_fk" FOREIGN KEY ("variant_attribute_id") REFERENCES "public"."variant_attribute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_to_value" ADD CONSTRAINT "product_variant_to_value_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_to_value" ADD CONSTRAINT "product_variant_to_value_variant_attribute_value_id_variant_attribute_value_id_fk" FOREIGN KEY ("variant_attribute_value_id") REFERENCES "public"."variant_attribute_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_to_value" ADD CONSTRAINT "product_variant_to_value_variant_attribute_id_variant_attribute_id_fk" FOREIGN KEY ("variant_attribute_id") REFERENCES "public"."variant_attribute"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ADD CONSTRAINT "variant_attribute_value_variant_attribute_id_variant_attribute_id_fk" FOREIGN KEY ("variant_attribute_id") REFERENCES "public"."variant_attribute"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_purchase_id_supplier_order_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."supplier_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_deleted_by_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_supplier_order_id_supplier_order_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "productToVariantAttributeIndex" ON "product_to_variant_attribute" USING btree ("product_id","variant_attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productVariantToAttributeIndex" ON "product_variant_to_value" USING btree ("product_variant_id","variant_attribute_id");--> statement-breakpoint
CREATE UNIQUE INDEX "variantAttributeValueIndex" ON "variant_attribute_value" USING btree ("value","variant_attribute_id");