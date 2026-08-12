# Apollo Server, explained for this codebase

This doc assumes you've read [`GRAPHQL.md`](./GRAPHQL.md) — it covers what
GraphQL *is*; this doc covers what Apollo Server specifically *adds* on
top of the spec, and exactly which parts of `src/index.ts` it's
responsible for. Much shorter than
[`../../taskmanager/api/APOLLO_SERVER.md`](../../taskmanager/api/APOLLO_SERVER.md)
— this variant has no second execution layer (no WebSocket/`graphql-ws`)
competing for the schema, so several sections of the original simply don't
apply.

## GraphQL needs an implementation — that's what Apollo Server is

GraphQL the spec says nothing about how to run a server. Something has to
actually parse a query, validate it against a schema, walk the resolver
tree, and produce a response — that's **execution**, and in the
JavaScript ecosystem the reference implementation of it is
**[`graphql-js`](https://github.com/graphql/graphql-js)** (the `graphql`
package). `graphql-js` gives you the parse/validate/execute machinery
described in `GRAPHQL.md` — but it has no opinion on HTTP, Express,
authentication, or error formatting.

**Apollo Server** is a batteries-included layer on top of `graphql-js`.
It doesn't replace `graphql-js`'s execution engine — it wraps it and adds
everything a real, deployed API needs around it: turning an incoming HTTP
request into a `graphql-js` execution call and the result back into an
HTTP response (via `expressMiddleware`), a **plugin system** for hooking
into the request lifecycle, consistent error formatting/masking, and
introspection/landing-page controls.

## Don't confuse this with Apollo *Client*

"Apollo" ships multiple, mostly-independent products sharing a name:

| | What it is | Used here? |
|---|---|---|
| **Apollo Server** | A GraphQL *server* library — runs in Node, executes queries against your schema | Yes — `api/`, `@apollo/server` in `api/package.json` |
| **Apollo Client** | A GraphQL *client* library — runs in the browser, sends queries, caches results | **No.** This variant's entire premise is not using it — `frontend/` talks to this API with a plain `fetch` wrapper (`frontend/src/lib/apiClient.ts`) instead. See `../frontend/DATA_LAYER.md`. |
| **Apollo Federation** | A spec + tooling for composing multiple GraphQL services into one schema | No — single, monolithic schema, same as the original. |

Nothing about Apollo Server *requires* Apollo Client — this repo is proof
of that in practice, not just in theory: the backend is unchanged from a
codebase that used to pair it with Apollo Client, and it works identically
paired with a hand-rolled `fetch` client instead.

## Apollo Server 4's biggest design change: no built-in HTTP server

Older Apollo Server versions (3 and earlier) had a built-in `.listen()`.
**Apollo Server 4 removed this.** It is now purely an execution +
lifecycle layer; you must bring your own HTTP server and hand it requests
via an integration package (`@apollo/server/express4` here, hence
`expressMiddleware`). This is *the* reason `src/index.ts` needs `express`
and `http` as separate, explicit dependencies.

> **Heads up on versioning:** Apollo Server 4 is now past its
> end-of-life date (Apollo's support window for v4 closed January 26,
> 2026). Same caveat as the original — nothing about the architecture
> described here changes if you migrate to v5, but budget time for it if
> extending this into something longer-lived.

## Anatomy of this app's Apollo Server instance

From `src/index.ts`:

```ts
const httpServer = http.createServer(app);

const apolloServer = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
  ],
});

await apolloServer.start();
```

Piece by piece, and how this differs from the original:

- **`typeDefs, resolvers` passed straight to `new ApolloServer(...)`** —
  the original instead built a standalone `GraphQLSchema` object first via
  `makeExecutableSchema({ typeDefs, resolvers })` (from
  `@graphql-tools/schema`), specifically because it needed to hand that
  same schema object to a *second* consumer: `useServer` from
  `graphql-ws`, for subscriptions. This variant has no second consumer —
  there's nothing else that needs an independent schema value — so
  letting `ApolloServer` build its schema internally (the more common,
  simpler way to use it) is the right choice here, not a corner cut.
- **`ApolloServer<GraphQLContext>`** — the generic type parameter tells
  TypeScript what shape the `context` object has, so every resolver's
  third argument is fully typed. Unchanged from the original —
  `GraphQLContext` (`src/context.ts`) is the same shape either way.
- **`plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]`** —
  exactly **one** plugin, versus the original's two. This built-in plugin
  makes `apolloServer.stop()` wait for in-flight HTTP requests to finish
  before shutting down. The original's *second* plugin — an inline
  `serverWillStart` hook disposing the WebSocket handler
  (`serverCleanup.dispose()`) — doesn't exist here, because there's no
  WebSocket handler to dispose. Nothing needed to bridge Apollo's
  shutdown sequence to a second transport, because there is no second
  transport.
- **`await apolloServer.start()`** — still required before the server can
  accept any requests, unchanged from the original.

## `expressMiddleware`: the adapter

```ts
app.use(
  "/graphql",
  cors({ origin: allowedOrigins, credentials: true }),
  json(),
  expressMiddleware(apolloServer, { context: createContext }),
);
```

Identical to the original. `expressMiddleware` bridges "an Express
request arrived" to "run this through Apollo Server's execution
pipeline." It's mounted after `cors()` and `json()` (Apollo needs a parsed
`req.body` and correct CORS headers already applied), and `{ context:
createContext }` is how the JWT auth middleware (`src/context.ts`) gets
invoked once per request — see [`../AUTH.md`](../AUTH.md).

## Where Apollo Server's job ends

Apollo Server does **not**:

- Talk to Postgres, or know Prisma exists — that's entirely inside
  resolvers (see [`PRISMA.md`](./PRISMA.md)).
- Decide *whether* a request is authenticated — it just calls whatever
  `context` function you give it; the actual `requireAuth()` check
  happens inside individual resolvers.

(The original's third bullet here — "handle WebSocket connections, that's
`graphql-ws`'s job" — doesn't apply; there's no WebSocket layer in this
variant at all, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).)

## Key files

| File | Role |
|---|---|
| `src/index.ts` | Constructs and starts the `ApolloServer` instance; mounts `expressMiddleware`. Noticeably smaller than the original's — no WebSocket wiring at all. |
| `src/context.ts` | The `context` function Apollo Server calls per-request — this app's JWT auth boundary. |
| `src/schema/typeDefs.ts` + `src/schema/resolvers/index.ts` | The `typeDefs`/`resolvers` Apollo Server executes against (see `GRAPHQL.md`). |
