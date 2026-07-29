// Pattern: Apollo Server 4 + Express, HTTP-only (queries/mutations). CORS
// origin is read from an env var (CORS_ORIGIN) rather than hard-coded, per
// the study plan's requirement.

import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { json } from "body-parser";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";

import { typeDefs } from "./schema/typeDefs";
import { resolvers } from "./schema/resolvers";
import { createContext, type GraphQLContext } from "./context";

async function main(): Promise<void> {
  const app = express();
  // Apollo Server 4 has no built-in `.listen()` — it's transport-agnostic and
  // expects to be mounted onto an HTTP server you own. We create that server
  // explicitly purely so ApolloServerPluginDrainHttpServer can do graceful
  // shutdown below.
  const httpServer = http.createServer(app);

  // No second execution layer needs a standalone schema object in this
  // variant (no WebSocket/subscriptions transport), so typeDefs/resolvers go
  // straight to ApolloServer instead of through makeExecutableSchema.
  const apolloServer = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
    plugins: [
      // Ensures in-flight HTTP requests finish (and no new ones are accepted)
      // before `httpServer.close()` resolves during shutdown — the standard
      // Apollo Server 4 + Express graceful-shutdown recipe.
      ApolloServerPluginDrainHttpServer({ httpServer }),
    ],
  });

  // Must be called before `expressMiddleware(apolloServer, ...)` below —
  // Apollo Server 4 requires `start()` to complete (it runs schema
  // validation and lifecycle hooks) before it will accept any operations.
  await apolloServer.start();

  // Pattern: CORS configured via env var, not hard-coded. Supports a
  // comma-separated list so staging/prod can allow multiple frontend origins
  // (e.g. a Vercel preview URL alongside the production domain) without a
  // code change — see api/.env.example for CORS_ORIGIN.
  const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim());

  // Middleware order matters here: cors() must run before json() so
  // preflight OPTIONS requests get CORS headers without needing a body
  // parsed, and both must run before expressMiddleware so the GraphQL
  // handler receives an already-parsed `req.body` and a context built by
  // `createContext` (JWT auth middleware — see ./context.ts).
  app.use(
    "/graphql",
    cors({ origin: allowedOrigins, credentials: true }),
    json(),
    expressMiddleware(apolloServer, { context: createContext }),
  );

  // Plain REST endpoint outside the /graphql path, deliberately not a
  // GraphQL query — deployment platforms and uptime monitors expect a
  // trivial HTTP GET they don't need to speak GraphQL to probe.
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  const PORT = Number(process.env.PORT ?? 4000);
  // Wrapped in a Promise because `httpServer.listen` is callback-based; this
  // lets `main()` stay a linear async function and ensures the "ready" log
  // below only prints once the server is actually accepting connections.
  await new Promise<void>((resolve) => httpServer.listen(PORT, resolve));

  console.log(`🚀 GraphQL server ready at http://localhost:${PORT}/graphql`);
}

// Top-level `await main()` isn't used because this file compiles to
// CommonJS (see tsconfig.json's `module: "CommonJS"`), which doesn't support
// top-level await. `.catch` here is what actually surfaces startup failures
// (e.g. a bad DATABASE_URL) as a non-zero exit code instead of an unhandled
// promise rejection that Node would otherwise report ambiguously.
main().catch((error: unknown) => {
  console.error("Fatal error starting server:", error);
  process.exitCode = 1;
});
