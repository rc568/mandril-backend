# Imágenes de variantes

## Configuración

Configurar en el entorno del backend:

```dotenv
STORAGE_BUCKET=nombre-del-bucket
STORAGE_REGION=us-east-1
STORAGE_PUBLIC_URL=https://imagenes.example.com
```

`STORAGE_PUBLIC_URL` es la base de lectura, sin la key ni el prefijo `products/`. Debe servir los objetos del bucket configurado. Subir un objeto no lo hace público: configurar la distribución/CDN o los permisos de lectura por separado. El adaptador no utiliza ACL públicas.

En AWS se recomienda un rol de ejecución. Si no se proporcionan las dos variables siguientes, el SDK utiliza su cadena habitual de credenciales (incluidas las variables AWS y los roles):

```dotenv
STORAGE_ACCESS_KEY_ID=credencial-local
STORAGE_SECRET_ACCESS_KEY=secreto-local
```

No versionar credenciales. Los permisos de escritura necesarios son `s3:PutObject` y `s3:DeleteObject` sobre el prefijo `products/variants/` del bucket. El frontend no recibe credenciales.

Para R2, configurar también `STORAGE_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com`, `STORAGE_REGION=auto` y sus credenciales. El código de Product permanece igual; se deben copiar los objetos y configurar la lectura. Las URLs existentes no se reescriben automáticamente.

La configuración de almacenamiento es opcional al iniciar la aplicación. Si falta, la carga responde 503; la organización de imágenes existentes sigue disponible.

## Migración

Aplicar `0019_product_images_storage_key` con `pnpm exec drizzle-kit migrate`. No usar `db:push` para este cambio: omitiría el relleno de `storage_key`.

La migración extrae las keys de las URLs S3 actuales y conserva `image_url`. Si encuentra otro formato, se detiene para revisarlo en lugar de adivinar la key. El seed también genera la key.

## Carga

`POST /products/:id/variants/:variantId/images`

Requiere sesión de administrador o empleado. Enviar `multipart/form-data` con un único archivo en `image`, sin campos de texto adicionales. El frontend debe dejar que el navegador construya Content-Type.

Límites centralizados en `domain/product.constants.ts`:

- 5 MiB por archivo y 10 imágenes por variante.
- JPEG, PNG o WebP, sin animación, hasta 20 millones de píxeles.
- Conversión a WebP, calidad 82 y dimensión máxima de 1600 píxeles, conservando proporciones.
- Máximo de dos cargas activas por proceso. Un exceso devuelve 429; el frontend debe esperar y reintentar. En múltiples instancias este límite se aplica por instancia.

Respuesta 201:

```json
{
  "id": "uuid-de-la-imagen",
  "imageUrl": "https://imagenes.example.com/products/variants/25/uuid.webp",
  "position": 1,
  "isPrimary": true
}
```

Cada imagen nueva se agrega al final. La primera de una variante vacía es principal. El backend genera la key y obtiene createdBy del usuario autenticado. Nunca utiliza el nombre del archivo para definir la posición.

## Organización

`PATCH /products/:id/variants/:variantId/images`

```json
{
  "imageIds": ["uuid-imagen-b", "uuid-imagen-a"],
  "primaryImageId": "uuid-imagen-a"
}
```

Los ejemplos usan marcadores: enviar UUID reales. Deben enviarse todas las imágenes actuales de la variante, una sola vez. Se asignan posiciones consecutivas desde 1. La principal puede estar en cualquier posición. La respuesta 200 es el array ordenado de imágenes con los mismos campos de la respuesta de carga.

Las posiciones se trasladan temporalmente a valores libres antes de asignar el orden final, para respetar el índice único. La operación se confirma en una transacción con bloqueo de la variante. Una lista incompleta o ajena devuelve 409; recargar la lista y volver a organizar.

## Fallos y reintentos

Los errores de tamaño devuelven 413; archivo ausente, formato inválido o formulario incorrecto, 400. Variante inexistente, ajena al producto o eliminada devuelve 404. Límite de imágenes o conflicto de organización devuelve 409. Una falla de S3 devuelve 500 con un mensaje público genérico.

La carga a S3 ocurre antes de la transacción corta de BD. Si existe un rechazo confirmado, se intenta eliminar el objeto. Si la eliminación falla o el resultado de la transacción es incierto, se registra la key y el identificador para reconciliación manual. No hay una cola automática de limpieza.

Si se pierde la respuesta de una carga, consultar las imágenes antes de reenviar: este endpoint no garantiza idempotencia entre solicitudes. Para evitar duplicados, no reintentar automáticamente cargas de resultado desconocido. Los reintentos de 429 son seguros porque no se recibió el archivo.

No mantener una transacción de BD abierta mientras se sube a S3. No registrar credenciales ni URLs firmadas. La eliminación de imágenes y la limpieza al eliminar variantes no forman parte de estos endpoints.
