import { sql } from 'drizzle-orm';
import { orderByMap } from '../../api/utils';

export const searchProductsQuery = (filters: {
  limit?: number;
  offset?: number;
  orderBy?: string;
  productIdentifier?: string | number;
  maxPrice?: number;
  minPrice?: number;
  catalogId?: number;
  categoryId?: number;
  isActive?: boolean;
  search?: string;
}) => {
  const searchTerm = filters.search ? `%${filters.search}%` : null;

  const productConditions = [
    filters.catalogId && sql`prod.catalog_id = ${filters.catalogId}`,
    filters.categoryId && sql`prod.category_id = ${filters.categoryId}`,
    filters.search &&
      sql`
        prod.name ILIKE ${searchTerm}
        OR EXISTS (
          SELECT 1
          FROM product_variant pv
          WHERE pv.product_id = prod.id
            AND pv.deleted_at IS NULL
            AND pv.code ILIKE ${searchTerm}
        )`,
    filters.productIdentifier
      ? typeof filters.productIdentifier === 'string'
        ? sql`prod.slug = ${filters.productIdentifier}`
        : sql`prod.id = ${filters.productIdentifier}`
      : false,
  ].filter(Boolean);

  const variantConditions = [
    filters.isActive !== undefined && sql`pv.is_active = ${filters.isActive}`,
    filters.minPrice !== undefined && sql`pv.price >= ${filters.minPrice}`,
    filters.maxPrice !== undefined && sql`pv.price <= ${filters.maxPrice}`,
  ].filter(Boolean);

  return sql`
    WITH
    	variant_attributes AS (
    		SELECT
    			pvtv.product_variant_id,
    			json_agg(json_build_object('value', vav.value, 'valueId', vav.id, 'attribute', va.name, 'attributeId', vav.variant_attribute_id)) AS "variantAttributes"
    		FROM
    			product_variant_to_value pvtv
    			JOIN variant_attribute_value vav ON pvtv.variant_attribute_value_id = vav.id
    			JOIN variant_attribute va ON vav.variant_attribute_id = va.id
    		GROUP BY
    			pvtv.product_variant_id
    	),
    	variant_images AS (
    		SELECT
    			product_variant_id,
    			json_agg(json_build_object('id', id, 'imageUrl', image_url)) AS "images"
    		FROM
    			product_images
    		GROUP BY
    			product_variant_id
    	),
    	product_attributes_agg AS (
    		SELECT
    			ptva.product_id,
    			json_agg(json_build_object('id', va.id, 'name', va.name, 'description', va.description)) AS "attributes"
    		FROM
    			product_to_variant_attribute ptva
    			JOIN variant_attribute va ON ptva.variant_attribute_id = va.id
    		GROUP BY
    			ptva.product_id
    	),
    	product_variants_agg AS (
    		SELECT
    			pv.product_id,
    			json_agg(
    				json_build_object(
    					'id', pv.id,
    					'code', pv.code,
    					'price', pv.price,
    					'purchasePrice', pv.purchase_price,
    					'quantityInStock', pv.quantity_in_stock,
    					'isActive', pv.is_active,
    					'images', COALESCE(vi.images, '[]'::json),
    					'variantAttributes', COALESCE(va."variantAttributes", '[]'::json)
    				)
    			) AS "productVariant"
    		FROM
    			product_variant pv
    			LEFT JOIN variant_attributes va ON pv.id = va.product_variant_id
    			LEFT JOIN variant_images vi ON pv.id = vi.product_variant_id
    		WHERE
    			pv.deleted_at IS NULL
                ${variantConditions.length > 0 ? sql` AND `.append(sql.join(variantConditions, sql` AND `)) : sql.empty()}
    		GROUP BY
    			pv.product_id
    	)
    SELECT
    	prod.id,
    	prod.name,
    	prod.slug,
    	prod.description,
        prod.is_active AS "isActive",
    	TO_CHAR(prod.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
        u.user_name as "createdBy",
    	json_build_object('id', cate.id, 'name', cate.name, 'slug', cate.slug) AS category,
    	json_build_object('id', cata.id, 'name', cata.name, 'slug', cata.slug) AS catalog,
    	COALESCE(paa.attributes, '[]'::json) AS attributes,
    	COALESCE(pva."productVariant", '[]'::json) AS "productVariant"
    FROM
    	product prod
    	INNER JOIN category cate ON prod.category_id = cate.id
    	INNER JOIN catalog cata ON prod.catalog_id = cata.id
    	LEFT JOIN product_attributes_agg paa ON prod.id = paa.product_id
    	INNER JOIN product_variants_agg pva ON prod.id = pva.product_id
    	INNER JOIN "user" u ON prod.created_by = u.id
    WHERE
    	prod.deleted_at IS NULL
        ${productConditions.length > 0 ? sql` AND `.append(sql.join(productConditions, sql` AND `)) : sql.empty()}
    ${filters.orderBy ? sql`ORDER BY ${orderByMap[filters.orderBy]}` : sql.empty()}
    ${filters.limit !== undefined ? sql`LIMIT ${filters.limit}` : sql.empty()}
    ${filters.offset !== undefined ? sql`OFFSET ${filters.offset}` : sql.empty()}`;
};

export const resumeProductsQuery = (filters: {
  maxPrice?: number;
  minPrice?: number;
  catalogId?: number;
  categoryId?: number;
  isActive?: boolean;
  search?: string;
}) => {
  const searchTerm = filters.search ? `%${filters.search}%` : null;

  const conditions = [
    filters.catalogId && sql`prod.catalog_id = ${filters.catalogId}`,
    filters.categoryId && sql`prod.category_id = ${filters.categoryId}`,
    filters.isActive !== undefined && sql`pv.is_active = ${filters.isActive}`,
    filters.minPrice !== undefined && sql`pv.price >= ${filters.minPrice}`,
    filters.maxPrice !== undefined && sql`pv.price <= ${filters.maxPrice}`,
    filters.search && sql`(pv.code ILIKE ${searchTerm} OR prod.name ILIKE ${searchTerm})`,
  ].filter(Boolean);

  return sql`
      SELECT
	      COUNT(DISTINCT prod.id) AS "totalProducts",
	      MIN(pv.price) AS "minPrice",
	      MAX(pv.price) AS "maxPrice"
      FROM
      	product prod
      	INNER JOIN product_variant pv ON prod.id = pv.product_id
      WHERE
      	prod.deleted_at IS NULL AND pv.deleted_at IS NULL
        ${conditions.length > 0 ? sql` AND `.append(sql.join(conditions, sql` AND `)) : sql.empty()} 
        ;`;
};
