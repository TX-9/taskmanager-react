// Pattern: GraphQL types generated from schema via graphql-codegen (TypeScript
// section). Run with `npm run codegen` (server must be running at the schema
// URL below) to regenerate src/graphql/generated.ts from the real schema and
// the operations in src/graphql/*.ts.
//
// Flow:
//   1. Introspects the live API at VITE_GRAPHQL_HTTP_URL (server must be running)
//   2. Reads all query/mutation documents in src/graphql/**/*.ts
//   3. Writes src/graphql/generated.ts — TypeScript interfaces for every schema
//      type (Task, User, enums) plus TData/TVariables pairs for each operation
//
// Re-run whenever the API schema changes or you add/edit a query in src/graphql/.
//
// No `typescript-react-apollo` plugin — this variant has no Apollo Client,
// so there are no hooks to generate, only plain TData/TVariables interfaces.

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  // Introspects the running API — not a static SDL file, so the server must be up.
  schema: process.env.VITE_GRAPHQL_HTTP_URL ?? "http://localhost:4000/graphql",
  // Hand-written query/mutation/fragment files; codegen reads these to produce
  // per-operation types (e.g. GetTasksQuery + GetTasksQueryVariables).
  documents: ["src/graphql/**/*.ts"],
  generates: {
    "src/graphql/generated.ts": {
      // `typescript` — schema-level types (Task, User, TaskStatus enum, etc.)
      // `typescript-operations` — per-operation TData/TVariables interfaces
      plugins: ["typescript", "typescript-operations"],
      config: {
        avoidOptionals: false,
        skipTypename: true, // no __typename fields in generated types
        scalars: {
          ID: "string", // GraphQL ID scalar → string, matching Prisma's uuid()
        },
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
