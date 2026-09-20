DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "product_images") AND (SELECT count(*) FROM "user") <> 1 THEN
    RAISE EXCEPTION 'El relleno de imágenes requiere exactamente un usuario.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "product_images"
    WHERE "image_url" !~ '/[0-9]+[.][a-zA-Z0-9]+([?#].*)?$'
      OR "product_variant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Existen imágenes sin variante o con un nombre que no permite obtener la posición.';
  END IF;
END;
$$;
--> statement-breakpoint
UPDATE "product_images"
SET "position" = substring("image_url" from '/([0-9]+)[.][a-zA-Z0-9]+([?#].*)?$')::integer,
    "is_primary" = substring("image_url" from '/([0-9]+)[.][a-zA-Z0-9]+([?#].*)?$')::integer = 1,
    "created_by" = (SELECT "id" FROM "user"),
    "created_at" = CURRENT_TIMESTAMP;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "product_images"
    GROUP BY "product_variant_id"
    HAVING count(*) FILTER (WHERE "is_primary") <> 1
  ) THEN
    RAISE EXCEPTION 'Cada variante con imágenes debe tener exactamente una imagen principal.';
  END IF;
END;
$$;
