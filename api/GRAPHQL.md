# GraphQL, explained for this codebase

This doc assumes no prior GraphQL knowledge. It covers what GraphQL
actually is (a spec, not a product), the vocabulary you need to read
`src/schema/typeDefs.ts` and any resolver, and how a request turns into a
response in this specific API. For "which library implements this spec
and how," see [`APOLLO_SERVER.md`](./APOLLO_SERVER.md). For the database
layer resolvers ultimately call into, see [`PRISMA.md`](./PRISMA.md).
Identical to [`../../taskmanager/api/GRAPHQL.md`](../../taskmanager/api/GRAPHQL.md)
in every section that doesn't mention subscriptions — this variant's
schema and resolvers are the original's, minus that one root type.

## What GraphQL actually is

GraphQL is a **specification** for a query language and an execution model
— published by the GraphQL Foundation, implemented by many libraries in
many languages. It is not a database, not a specific server product, and
not tied to any particular backend. "GraphQL" describes:

1. A syntax for clients to describe exactly what data they want (a
   **query** or a **mutation** — this API doesn't expose a third kind,
   **subscription**, at all; see "The two root types" below).
2. A type system for describing what data a server *can* provide (a
   **schema**).
3. A defined algorithm for turning a query + a schema + a set of
   **resolver** functions into a JSON response.

Nothing in that list says "use Node.js," "use Apollo," or "use Postgres."
This repo happens to implement GraphQL with `graphql-js` (via Apollo
Server, see `APOLLO_SERVER.md`) and Prisma/Postgres for storage, but those
are implementation choices, not part of the spec itself.

## Why GraphQL instead of REST

The pitch, concretely, using this app's own data:

- **REST**: `GET /api/tasks` typically returns every field of every task —
  `id`, `title`, `description`, `status`, `priority`, `userId`,
  `createdAt`, `updatedAt` — whether the screen needs all of them or not.
  Want tasks *and* their owners' emails? That's a second request per task,
  or a bespoke `?include=user` parameter someone has to build and
  maintain server-side.
- **GraphQL**: the client says exactly what it wants, once:

  ```graphql
  query Tasks {
    tasks(page: 1, limit: 20) {
      tasks {
        id
        title
        status
        user { email }
      }
    }
  }
  ```

  One request, only the fields asked for, including a nested relation
  (`user`), resolved server-side without a bespoke endpoint. This is
  (structurally) the actual query this app's frontend sends — see
  `frontend/src/graphql/queries.ts` — though, unlike the original, it's
  sent as a plain template-literal string via `fetch`, not a `gql`-tagged
  document Apollo Client parses client-side (see
  `../frontend/DATA_LAYER.md`).

The tradeoff is real, not one-sided: a GraphQL server has to do more work
per request (parse, validate, resolve a tree of fields) than a REST
endpoint that just serializes a database row, and naive resolver
implementations are vulnerable to the N+1 problem (see below) in a way
flat REST responses aren't.

## The building blocks

### Schema (SDL)

The schema is the contract: every type of data the API can return, and
every operation a client can perform, written in **Schema Definition
Language**. This app's entire schema lives in one place:
`src/schema/typeDefs.ts`. A few excerpts:

```graphql
type Task {
  id: ID!
  title: String!
  description: String
  status: TaskStatus!
  priority: TaskPriority!
  user: User!
  createdAt: String!
  updatedAt: String!
}
```

- `String!` — the `!` means **non-null**: the server guarantees this
  field is never `null` for a `Task`. `description: String` (no `!`)
  means it legitimately can be `null` (see `Task.description` in
  `prisma/schema.prisma` — it's an optional column).
- `TaskStatus` and `TaskPriority` are **enums**, defined elsewhere in the
  same file — the server rejects any value outside that set before a
  resolver even runs.
- `user: User!` is a **relation** — a field whose type is itself another
  object type in the schema, not a scalar. This is what lets a client ask
  for `task.user.email` in one request; see "Resolving a field" below.

### Scalars

The built-in scalar types are `String`, `Int`, `Float`, `Boolean`, and
`ID`. This schema doesn't define any custom scalars — dates are modeled as
`String` (ISO 8601, formatted in `Task.createdAt`/`Task.updatedAt`
resolvers) rather than a dedicated `DateTime` scalar.

### Input types

`type` describes data the server *returns*; `input` describes data a
client *sends* as an argument:

```graphql
input CreateTaskInput {
  title: String!
  description: String
  priority: TaskPriority
}
```

Used as: `createTask(input: CreateTaskInput!): Task!`. A client can send
`title` and `priority` on create, but can never set `id` or `createdAt`
directly; only the server assigns those.

### The two root types: Query and Mutation

Every schema has up to three special root types; this one only defines
two:

```graphql
type Query {
  me: User
  tasks(page: Int = 1, limit: Int = 20, filter: TaskFilterInput): TaskPage!
  task(id: ID!): Task
}

type Mutation {
  login(email: String!, password: String!): AuthPayload!
  createTask(input: CreateTaskInput!): Task!
  # ...
}
```

- **Query** — read-only, no side effects (by convention — GraphQL doesn't
  enforce this).
- **Mutation** — has side effects (writes). By spec, top-level mutation
  fields execute **sequentially**, one at a time, unlike top-level query
  fields which may run concurrently.
- **Subscription — deliberately not part of this schema.** The original
  had a third root type, `type Subscription { taskUpdated: Task! }`,
  pushing live updates over a WebSocket. This variant's whole premise is
  not having that — no `Subscription` block exists in `typeDefs.ts`, no
  `pubsub.ts` file exists at all. Every operation here is one request, one
  response, over plain HTTP.

### Arguments and variables

Fields can take arguments — `tasks(page: Int, limit: Int, filter:
TaskFilterInput)` — which is how GraphQL expresses "parameters" without
needing REST's query-string/path-param conventions. Clients almost never
hard-code argument values into the query string itself; instead they use
**variables**:

```graphql
query Tasks($page: Int, $limit: Int, $filter: TaskFilterInput) {
  tasks(page: $page, limit: $limit, filter: $filter) { ... }
}
```

sent alongside a separate `variables: { page: 1, limit: 20, filter: {...} }`
JSON object — see `frontend/src/lib/apiClient.ts`'s `graphqlRequest(query,
variables)`, which POSTs `{ query, variables }` as the request body. In
the original, this same variables-vs-hardcoded-values distinction was also
what let Apollo Client cache and reuse the *query document* while only
variables changed between calls; this variant has no cache to benefit from
that (see `../frontend/DATA_LAYER.md`), but the wire format is the same.

### Fragments

A **fragment** is a named, reusable selection of fields:

```graphql
fragment TaskFields on Task {
  id
  title
  description
  status
  priority
  createdAt
  updatedAt
  user { id email }
}
```

(`frontend/src/graphql/fragments.ts`). Every query and mutation that
returns a `Task` in this app's frontend spreads `...TaskFields` rather
than re-listing the fields. In the original, this mattered doubly because
Apollo's cache normalizes entities by type + id, so consistent field
selections kept cached copies in sync; here there's no cache to keep in
sync, so fragments are purely about avoiding repetition — still a real
reason, just a smaller one.

## Resolvers: where the schema meets real data

A resolver is just a function: `(parent, args, context, info) => value`.
The schema describes *what shape* the data has; resolvers describe *how
to get it*. This app's resolvers live in `src/schema/resolvers/` and are
merged into one object in `src/schema/resolvers/index.ts` — unchanged
from the original except that the merged map has no `Subscription` key.

Two resolver shapes appear in this codebase:

**Root-level resolvers** — `Query.tasks`, `Mutation.createTask`, etc. —
receive no meaningful `parent` and do the "real work": authorization,
validation, and a Prisma call.

```ts
// src/schema/resolvers/tasks.ts
tasks: async (_parent, args, context) => {
  const userId = requireAuth(context);
  // ...
  const tasks = await context.prisma.task.findMany({ where, ... });
  return { tasks, totalCount, page, limit, hasNextPage };
},
```

**Field-level resolvers** — resolvers attached to a specific type's
field, run once *per instance* of that type in the response tree:

```ts
// src/schema/resolvers/tasks.ts
Task: {
  user: (parent, _args, context) => {
    return context.loaders.userLoader.load(parent.userId);
  },
},
```

`parent` here is the `Task` object returned by the *previous* resolver —
each one still has a `userId` field but no `user` field yet. If you don't
write a field resolver for a field, GraphQL's default behavior is to just
read a same-named property off the parent object.

### Why `Task.user` is a resolver and not a plain property

This is the crux of the N+1 problem, GraphQL's most common performance
pitfall. A query like:

```graphql
query { tasks(limit: 20) { tasks { title user { email } } } }
```

asks for 20 tasks, each with a nested `user`. GraphQL's execution model
resolves the field tree **per instance** — so `Task.user` runs once per
task in the list. A naive implementation issues 1 query for the 20 tasks,
then 20 more — one per task — for their owners. This app avoids it with
**DataLoader**, batching all 20 `.load(userId)` calls made within the
same tick into a single `WHERE id IN (...)` query — see
`src/loaders/userLoader.ts` and `src/context.ts` for why a fresh loader is
built per request. Identical to the original; this mechanism has nothing
to do with subscriptions.

## Request lifecycle: parse → validate → execute

When a query arrives (over HTTP, via `expressMiddleware` — see
`APOLLO_SERVER.md`), three things happen before any resolver runs:

1. **Parse** — the query string is parsed into an AST. A syntactically
   malformed query fails here with a parse error.
2. **Validate** — the AST is checked against the schema: does `tasks`
   take a `filter` argument? Does `TaskFilterInput` have a `search`
   field? A query asking for a field that doesn't exist fails here,
   before touching the database.
3. **Execute** — the resolver tree runs, top-down, field by field.

All of this happens inside `graphql-js`, which Apollo Server wraps — see
`APOLLO_SERVER.md`.

## Errors in GraphQL

A GraphQL response is (almost) always HTTP 200, even when something
failed — errors are reported *inside* the JSON body, not via HTTP status
codes:

```json
{
  "data": { "createTask": null },
  "errors": [
    { "message": "Task title is required.", "extensions": { "code": "BAD_USER_INPUT" } }
  ]
}
```

This app throws typed `GraphQLError`s with a stable `extensions.code`
(`UNAUTHENTICATED`, `BAD_USER_INPUT`, `NOT_FOUND`, `FORBIDDEN` — see
`src/utils/errors.ts`), unchanged from the original, specifically so the
frontend can branch on *what kind* of error occurred instead of
pattern-matching error message strings. In the original that check lived
in Apollo Client's `errorLink`; here it's the same check, inlined into
`frontend/src/lib/apiClient.ts`'s `graphqlRequest` — see `../AUTH.md`
Part 6.

## Key files

| File | Role |
|---|---|
| `src/schema/typeDefs.ts` | The schema — every type, input, and operation this API exposes. No `Subscription` block. |
| `src/schema/resolvers/*.ts` | Resolver implementations, root-level and field-level. No `Subscription` resolver, no `pubsub` import. |
| `src/loaders/userLoader.ts` | DataLoader batching for `Task.user`, avoiding N+1. |
| `src/utils/errors.ts` | Typed GraphQL error factories with stable `extensions.code`. |
| `src/utils/validation.ts` | Input validation, called before resolvers touch the database. |
| `frontend/src/graphql/*.ts` | The actual query/mutation documents this API is queried with — plain strings, no `gql` tag. |
