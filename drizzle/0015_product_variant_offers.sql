ALTER TABLE "product_variant" ADD COLUMN "offer_price" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "offer_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_variant" ADD COLUMN "offer_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_variant" ADD CONSTRAINT "product_variant_offer_check" CHECK ((
      "product_variant"."offer_price" IS NULL AND "product_variant"."offer_starts_at" IS NULL AND "product_variant"."offer_ends_at" IS NULL
    ) OR (
      "product_variant"."offer_price" IS NOT NULL AND "product_variant"."offer_starts_at" IS NOT NULL AND "product_variant"."offer_ends_at" IS NOT NULL
      AND "product_variant"."offer_price" > 0 AND "product_variant"."offer_price" < "product_variant"."price"
      AND "product_variant"."offer_ends_at" > "product_variant"."offer_starts_at"
    ));