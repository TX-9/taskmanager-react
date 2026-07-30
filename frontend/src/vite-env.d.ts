// Loads Vite's built-in types (import.meta, asset imports, CSS modules, etc.)
/// <reference types="vite/client" />

// Extends Vite's ImportMetaEnv via declaration merging to add type safety for custom env vars.
// Without this, import.meta.env.VITE_* would be typed as any — no autocomplete, no typo errors.
interface ImportMetaEnv {
  readonly VITE_GRAPHQL_HTTP_URL: string;
}

// Tells TypeScript that import.meta.env has the shape of ImportMetaEnv above.
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
