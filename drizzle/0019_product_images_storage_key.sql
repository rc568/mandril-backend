ALTER TABLE "product_images" ADD COLUMN "storage_key" text;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "product_images"
    WHERE "image_url" !~ '^https://[^/]+[.]s3[.][^/]+[.]amazonaws[.]com/[^?#%]+$'
  ) THEN
    RAISE EXCEPTION 'Existen URLs de imágenes que requieren revisar su storage_key antes de migrar.';
  END IF;
END;
$$;
--> statement-breakpoint
SET CONSTRAINTS "product_images_primary_required" IMMEDIATE;
--> statement-breakpoint
UPDATE "product_images"
SET "storage_key" = regexp_replace("image_url", '^https://[^/]+/', '');
--> statement-breakpoint
ALTER TABLE "product_images" ALTER COLUMN "storage_key" SET NOT NULL;
