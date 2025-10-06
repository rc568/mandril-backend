export const errorMessages = {
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
    noVariantAttributes: 'No se pueden asignar atributos de variante ya que el producto no cuenta con variantes.',
    noVariantData: 'No se proporcionaron datos de variante.',
    invalidVariant: 'Variante no pertenece al producto.',
    attributeNotValid: 'Atributo no pertenece a este producto.',
    attributesWithOnlyOneVariant:
      'No se puede crear un producto con una sola variante cuando si se define al menos un atributo.',
    productAttributesNotUnique: 'Los atributos del producto deben ser únicos.',
    variantAttributesNotConsistent: 'Los atributos de la variante no son consistentes o están duplicados.',
    cannotDeleteLastVariant: 'Esta variante es la última, eliminarla significaría eliminar el producto.',
  },
  variantAttribue: {
    notFound: 'Atributo no existe.',
    nameExists: 'Atributo con ese nombre ya existe.',
  },
  variantAttribueValue: {
    notFoundInAttribute: 'Valor no existe en el atributo correspondiente.',
    valueExists: 'Atributo con ese valor ya existe.',
    valueNotFound: 'Valor no existe.',
  },
  skuCounter: {
    errorGenerating: 'SKU no puede ser generado. Contacte al administrador.',
  },
  auth: {
    userNotFound: 'Usuario no existe.',
    emailExists: 'Usuario con ese email ya existe.',
    userNameExists: 'Usuario con ese username ya existe.',
    passwordRegex: 'Contraseña debe tener al menos 8 caracteres e incluir una mayúscula, una minúscula y un número.',
    userNameRegex: 'Nombre de usuario solo debe contener minúsculas y números.',
    invalidRole: 'Rol de usuario no es válido.',
    roleNotFound: 'Rol no existe.',
    notAllowed: 'No tiene permiso para realizar esta acción.',
    loginInvalidCredentials: 'Usuario o contraseña incorrectos.',
    missingToken: 'Token no fue proporcionado.',
    invalidJwt: 'Token inválido.',
    errorCreatingJwt: 'Error creando el token.',
  },
  common: {
    invalidIdType: 'ID no es válido.',
    slugFormat: 'El slug debe contener solo letras minúsculas, números y guiones.',
    validationError: 'Error de validación de datos.',
    internalServerError: 'Error en el servidor. Contacte con el administrador.',
  },
};
