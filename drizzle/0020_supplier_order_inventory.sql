-- Existing development records are attributed to the sole importing user.
-- Stop instead of guessing an actor or silently resurrecting deleted purchases.
DO $$
BEGIN
  IF (EXISTS (SELECT 1 FROM "supplier") OR EXISTS (SELECT 1 FROM "supplier_order"))
     AND (SELECT count(*) FROM "user") <> 1 THEN
    RAISE EXCEPTION 'Supplier backfill requires exactly one importing user.';
  END IF;
  IF EXISTS (SELECT 1 FROM "supplier_order" WHERE "deleted_at" IS NOT NULL) THEN
    RAISE EXCEPTION 'Resolve deleted supplier orders before migrating.';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE TYPE "public"."inventory_bucket" AS ENUM('AVAILABLE', 'RESERVED', 'QUARANTINE', 'DEFECTIVE');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_currency" AS ENUM('PEN', 'USD');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_expense_type" AS ENUM('INTERNATIONAL_SHIPPING', 'CUSTOMS_TAXES', 'LOCAL_FREIGHT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_issue_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_issue_type" AS ENUM('SHORTAGE', 'DEFECTIVE', 'WRONG_PRODUCT');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_receipt_review_status" AS ENUM('PENDING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_record_origin" AS ENUM('SYSTEM', 'LEGACY_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_review_status" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."supplier_order_type" AS ENUM('PURCHASE', 'COMPENSATION');--> statement-breakpoint
ALTER TABLE "stock_movement" ALTER COLUMN "type" TYPE text;--> statement-breakpoint
DROP TYPE "public"."stock_movement_type";--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('SALE', 'RETURN', 'PURCHASE', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE');--> statement-breakpoint
ALTER TABLE "stock_movement" ALTER COLUMN "type" TYPE "public"."stock_movement_type" USING "type"::"public"."stock_movement_type";--> statement-breakpoint
CREATE TABLE "inventory_balance" (
	"product_variant_id" smallint NOT NULL,
	"bucket" "inventory_bucket" NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	CONSTRAINT "inventory_balance_pk" PRIMARY KEY("product_variant_id","bucket"),
	CONSTRAINT "inventory_balance_quantity_check" CHECK ("inventory_balance"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_order_expense" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_order_id" uuid NOT NULL,
	"type" "supplier_order_expense_type" NOT NULL,
	"description" text,
	"amount_usd" numeric(12, 6),
	"amount_pen" numeric(12, 6),
	"included_in_supplier_payment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "supplier_order_expense_usd_amount_check" CHECK ("supplier_order_expense"."amount_usd" > 0),
	CONSTRAINT "supplier_order_expense_pen_amount_check" CHECK ("supplier_order_expense"."amount_pen" > 0),
	CONSTRAINT "supplier_order_expense_amount_required_check" CHECK ("supplier_order_expense"."amount_usd" IS NOT NULL OR "supplier_order_expense"."amount_pen" IS NOT NULL),
	CONSTRAINT "supplier_order_expense_other_description_check" CHECK ("supplier_order_expense"."type" <> 'OTHER' OR ("supplier_order_expense"."description" IS NOT NULL AND length(trim("supplier_order_expense"."description")) > 0))
);
--> statement-breakpoint
CREATE TABLE "supplier_order_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_order_id" uuid NOT NULL,
	"supplier_order_product_id" uuid,
	"receipt_item_id" uuid,
	"type" "supplier_order_issue_type" NOT NULL,
	"quantity" integer NOT NULL,
	"status" "supplier_order_issue_status" DEFAULT 'OPEN' NOT NULL,
	"description" text NOT NULL,
	"resolution_note" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "supplier_order_issue_quantity_check" CHECK ("supplier_order_issue"."quantity" > 0),
	CONSTRAINT "supplier_order_issue_description_check" CHECK (length(trim("supplier_order_issue"."description")) > 0),
	CONSTRAINT "supplier_order_issue_source_check" CHECK (
      ("supplier_order_issue"."type" = 'SHORTAGE' AND "supplier_order_issue"."supplier_order_product_id" IS NOT NULL AND "supplier_order_issue"."receipt_item_id" IS NULL)
      OR ("supplier_order_issue"."type" = 'DEFECTIVE' AND "supplier_order_issue"."receipt_item_id" IS NOT NULL)
      OR ("supplier_order_issue"."type" = 'WRONG_PRODUCT' AND "supplier_order_issue"."supplier_order_product_id" IS NOT NULL AND "supplier_order_issue"."receipt_item_id" IS NOT NULL)
    ),
	CONSTRAINT "supplier_order_issue_closure_check" CHECK (
      ("supplier_order_issue"."status" = 'OPEN' AND "supplier_order_issue"."closed_at" IS NULL AND "supplier_order_issue"."closed_by" IS NULL)
      OR ("supplier_order_issue"."status" = 'CLOSED' AND "supplier_order_issue"."closed_at" IS NOT NULL AND "supplier_order_issue"."closed_by" IS NOT NULL
        AND "supplier_order_issue"."resolution_note" IS NOT NULL AND length(trim("supplier_order_issue"."resolution_note")) > 0)
    )
);
--> statement-breakpoint
CREATE TABLE "supplier_order_receipt_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"supplier_order_product_id" uuid,
	"product_variant_id" smallint NOT NULL,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"defective_quantity" integer DEFAULT 0 NOT NULL,
	"source_issue_id" uuid,
	"unplanned_unit_cost_pen" numeric(12, 6),
	"observation" text,
	CONSTRAINT "supplier_order_receipt_item_available_check" CHECK ("supplier_order_receipt_item"."available_quantity" >= 0),
	CONSTRAINT "supplier_order_receipt_item_defective_check" CHECK ("supplier_order_receipt_item"."defective_quantity" >= 0),
	CONSTRAINT "supplier_order_receipt_item_quantity_check" CHECK ("supplier_order_receipt_item"."available_quantity" > 0 OR "supplier_order_receipt_item"."defective_quantity" > 0),
	CONSTRAINT "supplier_order_receipt_item_cost_check" CHECK ("supplier_order_receipt_item"."unplanned_unit_cost_pen" >= 0),
	CONSTRAINT "supplier_order_receipt_item_unplanned_cost_check" CHECK ("supplier_order_receipt_item"."supplier_order_product_id" IS NULL OR "supplier_order_receipt_item"."unplanned_unit_cost_pen" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "supplier_order_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_order_id" uuid NOT NULL,
	"sequence_number" integer NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"received_by" uuid NOT NULL,
	"review_status" "supplier_order_receipt_review_status" DEFAULT 'PENDING' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"observation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_at" timestamp with time zone,
	"updated_by" uuid,
	CONSTRAINT "supplier_order_receipt_sequence_number_check" CHECK ("supplier_order_receipt"."sequence_number" > 0),
	CONSTRAINT "supplier_order_receipt_review_check" CHECK (
      ("supplier_order_receipt"."review_status" = 'PENDING' AND "supplier_order_receipt"."reviewed_at" IS NULL AND "supplier_order_receipt"."reviewed_by" IS NULL)
      OR ("supplier_order_receipt"."review_status" = 'COMPLETED' AND "supplier_order_receipt"."reviewed_at" IS NOT NULL AND "supplier_order_receipt"."reviewed_by" IS NOT NULL)
    )
);
--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "status" SET DEFAULT 'PREPARING'::text;--> statement-breakpoint
DROP TYPE "public"."supplier_order_status";--> statement-breakpoint
CREATE TYPE "public"."supplier_order_status" AS ENUM('PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "status" SET DEFAULT 'PREPARING'::"public"."supplier_order_status";--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "status" SET DATA TYPE "public"."supplier_order_status" USING (CASE "status" WHEN 'En camino' THEN 'IN_TRANSIT' WHEN 'Recibido' THEN 'RECEIVED' WHEN 'Cancelado' THEN 'CANCELLED' ELSE "status" END)::"public"."supplier_order_status";--> statement-breakpoint
ALTER TABLE "supplier_order_product" DROP CONSTRAINT "supplier_order_product_supplier_order_id_product_variant_id_pk";--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "import_policy" SET DATA TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "import_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "supplier_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "supplier_order_receipt_item_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "from_bucket" "inventory_bucket";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "to_bucket" "inventory_bucket";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "unit_cost_pen" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "type" "supplier_order_type" DEFAULT 'PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_product" RENAME COLUMN "quantity" TO "quantity_ordered";--> statement-breakpoint
ALTER TABLE "supplier_order_product" ALTER COLUMN "quantity_ordered" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "supplier_order_product" RENAME COLUMN "purchase_price" TO "unit_price";--> statement-breakpoint
ALTER TABLE "supplier_order_product" ALTER COLUMN "unit_price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "subtotal_price" numeric(12, 6) GENERATED ALWAYS AS ("supplier_order_product"."quantity_ordered" * "supplier_order_product"."unit_price") STORED;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "calculated_unit_cost" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "calculated_unit_cost_pen" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "created_by" uuid;--> statement-breakpoint
UPDATE "supplier_order_product" SET "created_by" = (SELECT "id" FROM "user");--> statement-breakpoint
ALTER TABLE "supplier_order_product" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "type" "supplier_order_type" DEFAULT 'PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "review_status" "supplier_order_review_status" DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "record_origin" "supplier_order_record_origin" DEFAULT 'SYSTEM' NOT NULL;--> statement-breakpoint
UPDATE "supplier_order" SET "record_origin" = 'LEGACY_IMPORT', "review_status" = NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" RENAME COLUMN "guide" TO "tracking_number";--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "tracking_number" TYPE varchar(255);--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "tracking_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "arrival_date_legacy" date;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "currency" "supplier_order_currency";--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "includes_igv" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "supplier_payment_amount" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "projected_exchange_rate" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "cost_calculation_version" varchar(50) DEFAULT 'LEGACY_V1' NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "receiving_closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "receiving_closed_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "created_by" uuid;--> statement-breakpoint
UPDATE "supplier_order" SET "created_by" = (SELECT "id" FROM "user");--> statement-breakpoint
ALTER TABLE "supplier_order" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "created_by" uuid;--> statement-breakpoint
UPDATE "supplier" SET "created_by" = (SELECT "id" FROM "user");--> statement-breakpoint
ALTER TABLE "supplier" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balance" ADD CONSTRAINT "inventory_balance_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_expense" ADD CONSTRAINT "supplier_order_expense_supplier_order_id_supplier_order_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_expense" ADD CONSTRAINT "supplier_order_expense_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_expense" ADD CONSTRAINT "supplier_order_expense_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_supplier_order_id_supplier_order_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_supplier_order_product_id_supplier_order_product_id_fk" FOREIGN KEY ("supplier_order_product_id") REFERENCES "public"."supplier_order_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_receipt_item_id_supplier_order_receipt_item_id_fk" FOREIGN KEY ("receipt_item_id") REFERENCES "public"."supplier_order_receipt_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_issue" ADD CONSTRAINT "supplier_order_issue_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt_item" ADD CONSTRAINT "supplier_order_receipt_item_receipt_id_supplier_order_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."supplier_order_receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt_item" ADD CONSTRAINT "supplier_order_receipt_item_supplier_order_product_id_supplier_order_product_id_fk" FOREIGN KEY ("supplier_order_product_id") REFERENCES "public"."supplier_order_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt_item" ADD CONSTRAINT "supplier_order_receipt_item_product_variant_id_product_variant_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."product_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt_item" ADD CONSTRAINT "supplier_order_receipt_item_source_issue_id_supplier_order_issue_id_fk" FOREIGN KEY ("source_issue_id") REFERENCES "public"."supplier_order_issue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt" ADD CONSTRAINT "supplier_order_receipt_supplier_order_id_supplier_order_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt" ADD CONSTRAINT "supplier_order_receipt_received_by_user_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt" ADD CONSTRAINT "supplier_order_receipt_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt" ADD CONSTRAINT "supplier_order_receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_receipt" ADD CONSTRAINT "supplier_order_receipt_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_order_expense_order_idx" ON "supplier_order_expense" USING btree ("supplier_order_id");--> statement-breakpoint
CREATE INDEX "supplier_order_issue_order_idx" ON "supplier_order_issue" USING btree ("supplier_order_id");--> statement-breakpoint
CREATE INDEX "supplier_order_issue_product_idx" ON "supplier_order_issue" USING btree ("supplier_order_product_id");--> statement-breakpoint
CREATE INDEX "supplier_order_issue_receipt_item_idx" ON "supplier_order_issue" USING btree ("receipt_item_id");--> statement-breakpoint
CREATE INDEX "supplier_order_receipt_item_receipt_idx" ON "supplier_order_receipt_item" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "supplier_order_receipt_item_product_idx" ON "supplier_order_receipt_item" USING btree ("supplier_order_product_id");--> statement-breakpoint
CREATE INDEX "supplier_order_receipt_item_variant_idx" ON "supplier_order_receipt_item" USING btree ("product_variant_id");--> statement-breakpoint
CREATE INDEX "supplier_order_receipt_item_source_issue_idx" ON "supplier_order_receipt_item" USING btree ("source_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_order_receipt_sequence_idx" ON "supplier_order_receipt" USING btree ("supplier_order_id","sequence_number");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_supplier_order_receipt_item_id_supplier_order_receipt_item_id_fk" FOREIGN KEY ("supplier_order_receipt_item_id") REFERENCES "public"."supplier_order_receipt_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_receiving_closed_by_user_id_fk" FOREIGN KEY ("receiving_closed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movement_receipt_item_bucket_idx" ON "stock_movement" USING btree ("supplier_order_receipt_item_id","to_bucket") WHERE "stock_movement"."supplier_order_receipt_item_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "supplier_order_product_order_idx" ON "supplier_order_product" USING btree ("supplier_order_id");--> statement-breakpoint
CREATE INDEX "supplier_order_product_variant_idx" ON "supplier_order_product" USING btree ("product_variant_id");--> statement-breakpoint
CREATE INDEX "supplier_order_supplier_idx" ON "supplier_order" USING btree ("supplier_id");--> statement-breakpoint



ALTER TABLE "supplier_order" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_unit_cost_check" CHECK ("stock_movement"."unit_cost_pen" >= 0);--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_reservation_check" CHECK (
      "stock_movement"."type" NOT IN ('RESERVATION', 'RESERVATION_RELEASE') OR (
        "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."from_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IS NOT NULL
        AND "stock_movement"."deleted_at" IS NULL AND "stock_movement"."deleted_by" IS NULL
        AND (("stock_movement"."type" = 'RESERVATION' AND "stock_movement"."from_bucket" = 'AVAILABLE' AND "stock_movement"."to_bucket" = 'RESERVED')
          OR ("stock_movement"."type" = 'RESERVATION_RELEASE' AND "stock_movement"."from_bucket" = 'RESERVED' AND "stock_movement"."to_bucket" = 'AVAILABLE'))
      )
    );--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_source_check" CHECK (
      "stock_movement"."from_bucket" IS NULL OR "stock_movement"."type" = 'ADJUSTMENT' OR (
        "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."deleted_at" IS NULL AND "stock_movement"."deleted_by" IS NULL
        AND ("stock_movement"."type" IN ('RESERVATION', 'RESERVATION_RELEASE')
          OR ("stock_movement"."type" = 'SALE' AND "stock_movement"."from_bucket" IN ('AVAILABLE', 'RESERVED') AND "stock_movement"."to_bucket" IS NULL
            AND "stock_movement"."unit_cost_pen" IS NOT NULL))
      )
    );--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_adjustment_check" CHECK ("stock_movement"."type" <> 'ADJUSTMENT' OR ("stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IS NULL) OR (
        "stock_movement"."order_id" IS NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
        AND "stock_movement"."note" IS NOT NULL AND length(trim("stock_movement"."note")) > 0
        AND "stock_movement"."deleted_at" IS NULL AND "stock_movement"."deleted_by" IS NULL
        AND (("stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE'))
          OR ("stock_movement"."to_bucket" IS NULL AND "stock_movement"."from_bucket" IS NOT NULL AND "stock_movement"."from_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')))
      ));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_return_destination_check" CHECK ("stock_movement"."type" <> 'RETURN' OR "stock_movement"."to_bucket" IS NULL OR (
        "stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')
        AND "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
        AND "stock_movement"."deleted_at" IS NULL AND "stock_movement"."deleted_by" IS NULL
      ));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_receipt_entry_check" CHECK (
    "stock_movement"."supplier_order_receipt_item_id" IS NULL OR (
    "stock_movement"."type" = 'PURCHASE' AND "stock_movement"."purchase_id" IS NOT NULL AND "stock_movement"."order_id" IS NULL AND "stock_movement"."from_bucket" IS NULL
      AND "stock_movement"."to_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'DEFECTIVE')
      AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
      AND "stock_movement"."deleted_at" IS NULL AND "stock_movement"."deleted_by" IS NULL
    )
  );--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_quantity_check" CHECK ("supplier_order_product"."quantity_ordered" > 0);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_price_check" CHECK ("supplier_order_product"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_cost_check" CHECK ("supplier_order_product"."calculated_unit_cost_pen" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_currency_cost_check" CHECK ("supplier_order_product"."calculated_unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_order_product" ADD CONSTRAINT "supplier_order_product_compensation_price_check" CHECK ("supplier_order_product"."type" <> 'COMPENSATION' OR ("supplier_order_product"."unit_price" IS NOT NULL AND "supplier_order_product"."unit_price" = 0));--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_payment_amount_check" CHECK ("supplier_order"."supplier_payment_amount" >= 0);--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_projected_exchange_rate_check" CHECK ("supplier_order"."projected_exchange_rate" > 0);--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_payment_currency_check" CHECK ("supplier_order"."supplier_payment_amount" IS NULL OR "supplier_order"."currency" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "supplier_order" ADD CONSTRAINT "supplier_order_legacy_arrival_date_check" CHECK ("supplier_order"."record_origin" = 'LEGACY_IMPORT' OR "supplier_order"."arrival_date_legacy" IS NULL);