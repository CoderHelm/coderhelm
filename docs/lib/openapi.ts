import { createOpenAPI } from 'fumadocs-openapi/server';

// The public API's OpenAPI document, copied from the platform repo by
// scripts/import-platform.mjs (it is generated there from the gateway's code).
// The API reference pages are generated from it at build time.
export const openapi = createOpenAPI({
  input: ['./.generated/openapi.json'],
});
