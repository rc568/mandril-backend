ALTER TABLE "product_images" ALTER COLUMN "product_variant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ALTER COLUMN "is_primary" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_variant_position_unique" ON "product_images" USING btree ("product_variant_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_variant_primary_unique" ON "product_images" USING btree ("product_variant_id") WHERE "product_images"."is_primary" = true;--> statement-breakpoint
ALTER TABLE "product_images" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_position_check" CHECK ("product_images"."position" > 0);
--> statement-breakpoint
CREATE FUNCTION "validate_product_images_primary"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  variant_ids smallint[];
  variant_id smallint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    variant_ids := ARRAY[NEW.product_variant_id];
  ELSIF TG_OP = 'DELETE' THEN
    variant_ids := ARRAY[OLD.product_variant_id];
  ELSE
    variant_ids := ARRAY[OLD.product_variant_id, NEW.product_variant_id];
  END IF;

  FOR variant_id IN SELECT DISTINCT unnest(variant_ids) ORDER BY 1
  LOOP
    PERFORM 1 FROM "product_variant" WHERE "id" = variant_id FOR NO KEY UPDATE;

    IF EXISTS (
      SELECT 1 FROM "product_images"
      WHERE "product_variant_id" = variant_id
      HAVING count(*) > 0 AND count(*) FILTER (WHERE "is_primary") <> 1
    ) THEN
      RAISE EXCEPTION 'La variante % debe tener exactamente una imagen principal.', variant_id
        USING ERRCODE = '23514',
              CONSTRAINT = 'product_images_primary_required',
              TABLE = 'product_images';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "product_images_primary_required"
AFTER INSERT OR UPDATE OR DELETE ON "product_images"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "validate_product_images_primary"();
