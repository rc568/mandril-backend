ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_reservation_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_order_source_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_adjustment_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_return_destination_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_receipt_entry_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_updated_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_deleted_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "client" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "variant_attribute" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "variant_attribute" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
DO $$
DECLARE
  user_id uuid;
BEGIN
  IF (SELECT count(*) FROM "user") <> 1 THEN
    RAISE EXCEPTION 'Migration 0023 requires exactly one row in "user" to backfill created_by.';
  END IF;

  SELECT id INTO user_id FROM "user";

  UPDATE "client" SET "created_by" = user_id WHERE "created_by" IS NULL;
  UPDATE "variant_attribute" SET "created_by" = user_id WHERE "created_by" IS NULL;
  UPDATE "variant_attribute_value" SET "created_by" = user_id WHERE "created_by" IS NULL;
END;
$$;--> statement-breakpoint
ALTER TABLE "client" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "variant_attribute" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client" ADD CONSTRAINT "client_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute" ADD CONSTRAINT "variant_attribute_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute" ADD CONSTRAINT "variant_attribute_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ADD CONSTRAINT "variant_attribute_value_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_attribute_value" ADD CONSTRAINT "variant_attribute_value_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sku_counter" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "sku_counter" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "sku_counter" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "updated_by";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP COLUMN "deleted_by";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_reservation_check" CHECK (
      "stock_movement"."type" NOT IN ('RESERVATION', 'RESERVATION_RELEASE') OR (
        "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."from_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IS NOT NULL
        AND (("stock_movement"."type" = 'RESERVATION' AND "stock_movement"."from_bucket" = 'AVAILABLE' AND "stock_movement"."to_bucket" = 'RESERVED')
          OR ("stock_movement"."type" = 'RESERVATION_RELEASE' AND "stock_movement"."from_bucket" = 'RESERVED' AND "stock_movement"."to_bucket" = 'AVAILABLE'))
      )
    );--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_order_source_check" CHECK (
      "stock_movement"."from_bucket" IS NULL OR "stock_movement"."type" = 'ADJUSTMENT' OR (
        "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0
        AND ("stock_movement"."type" IN ('RESERVATION', 'RESERVATION_RELEASE')
          OR ("stock_movement"."type" = 'SALE' AND "stock_movement"."from_bucket" IN ('AVAILABLE', 'RESERVED') AND "stock_movement"."to_bucket" IS NULL
            AND "stock_movement"."unit_cost_pen" IS NOT NULL))
      )
    );--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_adjustment_check" CHECK ("stock_movement"."type" <> 'ADJUSTMENT' OR ("stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IS NULL) OR (
        "stock_movement"."order_id" IS NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
        AND "stock_movement"."note" IS NOT NULL AND length(trim("stock_movement"."note")) > 0
        AND (("stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE'))
          OR ("stock_movement"."to_bucket" IS NULL AND "stock_movement"."from_bucket" IS NOT NULL AND "stock_movement"."from_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')))
      ));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_return_destination_check" CHECK ("stock_movement"."type" <> 'RETURN' OR "stock_movement"."to_bucket" IS NULL OR (
        "stock_movement"."from_bucket" IS NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'QUARANTINE', 'DEFECTIVE')
        AND "stock_movement"."order_id" IS NOT NULL AND "stock_movement"."purchase_id" IS NULL AND "stock_movement"."supplier_order_receipt_item_id" IS NULL
        AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
      ));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_receipt_entry_check" CHECK (
    "stock_movement"."supplier_order_receipt_item_id" IS NULL OR (
    "stock_movement"."type" = 'PURCHASE' AND "stock_movement"."purchase_id" IS NOT NULL AND "stock_movement"."order_id" IS NULL AND "stock_movement"."from_bucket" IS NULL
      AND "stock_movement"."to_bucket" IS NOT NULL AND "stock_movement"."to_bucket" IN ('AVAILABLE', 'DEFECTIVE')
      AND "stock_movement"."quantity" > 0 AND "stock_movement"."unit_cost_pen" IS NOT NULL
    )
  );
