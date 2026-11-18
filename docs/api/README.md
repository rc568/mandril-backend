# API documentation

The backend serves the OpenAPI 3.1 document at `/api/openapi.json` and the interactive Scalar reference at `/api/docs`.

The Scalar Express integration requires Node.js 22 or newer.

## Adding a module

Register operations in `src/app/openapi/<module>.openapi.ts` and import that file from `src/app/openapi/index.ts`. Reuse the module's existing Zod schemas for request bodies, query parameters and path parameters. Define response schemas from the JSON the controller actually sends; successful responses currently return the value directly, without a `{ data: ... }` wrapper.

Each operation should state its purpose, required cookies or role, request and response shapes, and expected HTTP status codes. The shared registry in `src/app/openapi/registry.ts` contains the common error shape and cookie authentication schemes.

## Authentication notes

The API base path is `/api`. The access cookie is named `accessToken`; the refresh cookie is named `refreshToken`. Both are HttpOnly and use `SameSite=Strict`. The refresh cookie is scoped to `/api/auth/token`. Browser clients calling the API from another origin need to send credentials and the server must allow that origin with credentialed CORS.
