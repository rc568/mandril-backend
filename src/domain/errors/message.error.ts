export const errorMessage = {
  category: {
    notFound: 'Categoría no existe.',
    slugExists: 'Categoría con ese slug ya existe.',
  },
  catalog: {
    notFound: 'Catálogo no existe.',
    slugExists: 'Catálogo con ese slug ya existe.',
  },
  product: {
    notFoundBySlug: 'Producto con ese slug no existe.',
    notFoundById: 'Producto con ese id no existe.',
    slugExists: 'Product con ese slug ya existe.',
    codeExists: 'Hubo un problema al generar el código del producto. Intente nuevamente.',
    uniqueConstraint: 'Una restricción de unicidad fue violada al crear el producto.',
    noVariantAttributes: 'No se pueden asignar atributos de variante a un producto sin variantes.',
    noVariantData: 'No se proporcionaron datos de variante.',
    invalidVariant: 'Variante no pertenece al producto.',
    attributeNotValid: 'Atributo no pertenece a este producto.',
    attributesWithOnlyOneVariant:
      'No se puede crear un producto con una sola variante cuando si se define al menos un atributo.',
    productAttributesNotUnique: 'Los atributos del producto deben ser únicos.',
    variantAttributesNotConsistent: 'Los atributos de la variante no son consistentes o están duplicados.',
  },
  variantAttribue: {
    notFound: 'Atributo no existe.',
    nameExists: 'Atributo con ese nombre ya existe.',
  },
  variantAttribueValue: {
    notFoundInAttribute: 'Valor no existe en el atributo correspondiente.',
    valueExists: 'Atributo con ese valor ya existe.',
  },
  skuCounter: {
    errorGenerating: 'SKU no puede ser generado. Contacte al administrador.',
  },
  common: {
    invalidIdType: 'ID no es válido.',
    slugFormat: 'El slug debe contener solo letras minúsculas, números y guiones.',
  },
};
