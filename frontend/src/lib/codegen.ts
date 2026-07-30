// Pattern: GraphQL types generated from schema via graphql-codegen (TypeScript
// section). Run with `npm run codegen` (server must be running at the schema
// URL below) to regenerate src/graphql/generated.ts from the real schema and
// the operations in src/graphql/*.ts.
//
// No `typescript-react-apollo` plugin — this variant has no Apollo Client,
// so there are no hooks to generate, only plain TData/TVariables interfaces.

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: process.env.VITE_GRAPHQL_HTTP_URL ?? "http://localhost:4000/graphql",
  documents: ["src/graphql/**/*.ts"],
  generates: {
    "src/graphql/generated.ts": {
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: false,
        skipTypename: true,
        scalars: {
          ID: "string",
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
