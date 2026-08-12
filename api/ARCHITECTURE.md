# API server architecture: Express and Apollo Server, HTTP-only

This doc explains how the pieces wired together in `src/index.ts` relate
to each other. Much shorter than
[`../../taskmanager/api/ARCHITECTURE.md`](../../taskmanager/api/ARCHITECTURE.md)
— that doc has to explain **five** layers stacking `express`, `http`,
`ws`, `graphql-ws`, and `@apollo/server` together, because subscriptions
need a WebSocket alongside HTTP. This variant only has one transport, so
there's no dual-transport diagram to draw and no "why does this file need
so many pieces" question to answer. For the GraphQL and Apollo Server
concepts referenced throughout, see [`GRAPHQL.md`](./GRAPHQL.md) and
[`APOLLO_SERVER.md`](./APOLLO_SERVER.md). For the database layer resolvers
call into, see [`PRISMA.md`](./PRISMA.md).

## Two layers, not five

```
┌──────────────────────────────────────────────────────────────────┐
│ 2. Apollo Server 4        Executes queries/mutations against the │
│    (@apollo/server)       schema, via expressMiddleware.         │
├──────────────────────────────────────────────────────────────────┤
│ 1. Express + http.Server  Routes plain HTTP requests: CORS, JSON │
│    (app.use, app.get)     body parsing, the /health check, and — │
│                           for /graphql POST requests — handing   │
│                           off to Apollo.                          │
└──────────────────────────────────────────────────────────────────┘
```

`const httpServer = http.createServer(app)` still exists in `src/index.ts`
— not because a second transport needs to share the port with Express
(there is no second transport), but purely so
`ApolloServerPluginDrainHttpServer` has a real `http.Server` instance to
hook into for graceful shutdown. That's a legitimate, narrow reason to
keep `http` as an explicit dependency, unrelated to the original's reason
for needing it (sharing one port between two protocols).

## What "the schema" means here

```ts
const apolloServer = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});
```

The original built a standalone `GraphQLSchema` via `makeExecutableSchema`
*before* constructing `ApolloServer`, specifically because it needed to
hand that same schema object to a second execution layer (`useServer`
from `graphql-ws`) — without that, subscriptions would have had nothing
to execute against. This variant has no second execution layer at all, so
`typeDefs`/`resolvers` go straight into `new ApolloServer(...)`, which
builds its schema internally — the simpler, more common way to use Apollo
Server, and the right choice here since there's no second consumer that
would need an independent schema value.

## One context, one transport

Every GraphQL resolver receives a `context` argument (`GraphQLContext` —
`{ prisma, userId, loaders }`, see `src/context.ts`), built freshly per
request so `loaders.userLoader`'s DataLoader cache doesn't leak between
unrelated requests. There's exactly one way this happens here:

- **HTTP** — `createContext` (`src/context.ts`) runs once per Express
  request, reading the JWT from the `Authorization` header.

The original also needed a *second*, near-duplicate version of this same
logic inside `src/index.ts` itself, reading the token from a WebSocket
connection's `connectionParams` instead of a header — because a WebSocket
connection never has an Express `req` to pass `createContext`. That
duplication doesn't exist here: `createContext`'s `({ req }) => ...`
signature is the *only* context-building path in this codebase, since
there's only one transport that ever needs one.

## Request lifecycle: a query or mutation

1. Browser sends `POST /graphql` with `Authorization: Bearer <token>`
   (attached by `frontend/src/lib/apiClient.ts`'s `graphqlRequest`).
2. Express's router matches `/graphql` and runs the middleware chain in
   order: `cors()` → `json()` → `expressMiddleware(apolloServer, ...)`.
3. `expressMiddleware` calls `createContext({ req })`, which verifies the
   JWT, resolves `userId`, and builds a fresh `userLoader`.
4. Apollo Server parses the GraphQL operation, validates it against the
   schema, and executes the matching resolver(s) in
   `src/schema/resolvers/`, passing them the context from step 3.
5. Resolvers that require auth call `requireAuth(context)`
   (`src/schema/resolvers/auth.ts`), which throws an `UNAUTHENTICATED`
   error if `context.userId` is null.
6. The response is serialized back through Express as a normal HTTP
   response.

That's the entire request lifecycle this API supports — there is no
second lifecycle for a long-lived subscription connection to trace,
unlike the original's two separate sequences for query/mutation vs.
subscription.

## Startup and shutdown sequence

Order matters in `main()` (`src/index.ts`):

1. `new ApolloServer(...)` — constructed with exactly one plugin,
   `ApolloServerPluginDrainHttpServer`, which hooks into HTTP shutdown so
   `apolloServer.stop()` waits for in-flight requests to finish. The
   original's *second* plugin — an inline hook disposing a WebSocket
   handler — doesn't exist here, since there's no WebSocket handler.
2. `await apolloServer.start()` — must happen before any request is
   routed to `expressMiddleware`; Apollo validates the schema and runs
   startup lifecycle hooks here.
3. `app.use("/graphql", cors(), json(), expressMiddleware(...))` — only
   now is the HTTP path wired up.
4. `app.get("/health", ...)` — a plain REST endpoint, deliberately not
   GraphQL, so deployment platforms/uptime monitors can probe liveness
   with a trivial GET.
5. `httpServer.listen(PORT)` — only now does the process start accepting
   connections.

## Key files

| File | Role |
|---|---|
| `src/index.ts` | Wires Express and Apollo Server together. Noticeably smaller than the original's — no `ws`/`graphql-ws` imports at all. |
| `src/schema/typeDefs.ts` | The GraphQL SDL. No `Subscription` block. |
| `src/schema/resolvers/*.ts` | Resolver implementations. |
| `src/context.ts` | Builds `GraphQLContext` for the one and only transport this API has. |
| `src/utils/auth.ts` | JWT sign/verify — used by `src/context.ts`. Nowhere else needs it, unlike the original where `src/index.ts` also called it directly for the WebSocket path. |

## A note on scaling

The original's equivalent doc ends with a note about `pubsub.ts`'s
in-memory `PubSub` only working within a single process, and needing
`graphql-redis-subscriptions` if the API is ever deployed with more than
one instance. **That entire concern doesn't exist in this variant** —
there's no `pubsub.ts`, no in-process event bus, nothing that would behave
differently across multiple instances behind a load balancer. Every
request here is a self-contained HTTP round trip; horizontal scaling this
API is exactly as straightforward as scaling any stateless HTTP service,
with no cross-instance coordination question to think about at all.
