// Hand-authored domain type mirroring the GraphQL `User` type. Once
// graphql-codegen is run against the live schema (see src/lib/codegen.ts),
// prefer the generated `User` type from src/graphql/generated.ts wherever a
// query response's shape needs to be typed precisely.

export interface User {
  id: string;
  email: string;
  createdAt: string;
}
