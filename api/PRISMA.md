# Prisma, explained for this codebase

This doc assumes no prior Prisma knowledge. It covers what Prisma actually
is, how `prisma/schema.prisma` becomes both a real Postgres schema and a
typed JS client, and how resolvers use that client. For how resolvers
avoid Prisma-related N+1 queries when resolving GraphQL relations, see
[`GRAPHQL.md`](./GRAPHQL.md)'s "Why `Task.user` is a resolver and not a
plain property" section.

Essentially unchanged from
[`../../taskmanager/api/PRISMA.md`](../../taskmanager/api/PRISMA.md) —
`prisma/schema.prisma` is byte-for-byte identical between the two repos
(same `User`/`Task` models, same `TaskStatus`/`TaskPriority` enums, same
indexes), copied verbatim in this variant's build (Chunk 2). Nothing about
dropping GraphQL subscriptions touches the data model or how resolvers
call Prisma Client at all — this doc exists mainly so the file's still
here for reference, not because there was much to actually change.

## What Prisma actually is

"Prisma" isn't one thing — it's three tools that share a single source of
truth, `prisma/schema.prisma`:

1. **Prisma Schema** — a schema language (not SQL, not JavaScript) that
   describes your data models once, in one file.
2. **Prisma Migrate** — reads that schema, diffs it against your actual
   database, and generates versioned SQL migration files to bring the
   database in line.
3. **Prisma Client** — reads that same schema and *generates* a fully
   typed JavaScript/TypeScript API for querying your database.

You write your data model **once**, in one place, and get a real Postgres
schema *and* a type-safe client *and* a migration history out of it, all
guaranteed to agree with each other because they're all derived from the
same file.

## Reading `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  tasks        Task[]

  @@map("users")
}
```

- **`generator client`** — tells Prisma *what to generate* from this
  schema. Running `npx prisma generate` (or `npm run prisma:generate`)
  reads the whole schema and writes a generated client into
  `node_modules/@prisma/client`. This is a build step, not something you
  hand-edit.
- **`datasource db`** — which database and where. `env("DATABASE_URL")`
  reads the connection string from the environment. **This variant's own
  `.env.example` defaults to a distinct database name than the original's
  (`taskmanager_react` vs. `taskmanager`)** — worth knowing if you're
  running both repos against the same local Postgres instance; see the
  root [`../README.md`](../README.md)'s local-setup section for the full
  collision note.
- **`model User { ... }`** — one model per table. `id String @id
  @default(uuid())` is a UUID primary key, not auto-incrementing, so IDs
  are safe to expose in a public GraphQL API. `email String @unique` is a
  database-level uniqueness constraint. `tasks Task[]` is a **relation
  field**, not a real column — it lets Prisma Client offer `include:
  { tasks: true }` if you ever wanted it (this app doesn't use that — see
  "Why resolvers don't use `include`" below). `@@map("users")` lets the
  Prisma model (`User`, PascalCase) and the Postgres table (`users`,
  snake_case) use their own idiomatic naming conventions independently.

```prisma
model Task {
  id          String       @id @default(uuid())
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  userId      String
  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@index([userId])
  @@index([userId, status])
  @@map("tasks")
}
```

- **`description String?`** — the `?` means nullable. This is a
  *separate* type system from GraphQL's own nullability syntax
  (`String`/`String!`, see `GRAPHQL.md`) that happens to use similar
  punctuation; `Task.description` being optional here is exactly why the
  GraphQL schema also declares `description: String` (no `!`).
- **`status TaskStatus @default(TODO)`** — `TaskStatus` is a Prisma
  `enum`, constrained at the database level (Postgres gets a real `enum`
  type, not just a `varchar` with app-level validation).
- **`userId String` + `user User @relation(...)`** — this pair is how
  Prisma expresses a foreign key. `onDelete: Cascade` means deleting a
  `User` row deletes all their `Task` rows automatically, at the database
  level.
- **`@@index([userId])`** and **`@@index([userId, status])`** — explicit
  database indexes. The first speeds up "all tasks for this user" (every
  query in `src/schema/resolvers/tasks.ts` filters by `userId`). The
  second speeds up filtering by both owner *and* status at once.

## Prisma Migrate: schema.prisma → real SQL

Editing `schema.prisma` doesn't change your database by itself — it's a
description of the *desired* state.

- **`npm run prisma:migrate`** (`prisma migrate dev`) — the development
  workflow. Diffs `schema.prisma` against the database, generates a new
  timestamped SQL file under `prisma/migrations/`, applies it, and
  regenerates Prisma Client. Interactive — prompts for a migration name.
- **`npm run prisma:deploy`** (`prisma migrate deploy`) — the
  production/CI workflow. Applies any migration files that exist in
  `prisma/migrations/` but haven't been applied yet. Non-interactive.
  **Unlike the original**, this variant has no `api/railway.json` and no
  CI workflow yet to actually invoke this command automatically — it's
  documented here for when that deployment config exists, but for now
  it's a manual step.

The practical rule: **you generate migrations locally (`dev`), commit the
generated SQL files, and every other environment just replays them
(`deploy`)**.

## Prisma Client: the generated, typed query API

```ts
// src/context.ts
export const prisma = new PrismaClient();
```

One `PrismaClient` instance, as a module-level singleton — unchanged from
the original. `PrismaClient` manages its own connection pool internally;
creating a new instance per request would open a new pool per request and
quickly exhaust Postgres's `max_connections`. Every resolver reaches this
same instance through `context.prisma`.

### How resolvers actually use it

```ts
// src/schema/resolvers/tasks.ts
const [tasks, totalCount] = await Promise.all([
  context.prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  }),
  context.prisma.task.count({ where }),
]);
```

`where` is built conditionally from the GraphQL `filter` argument as a
genuine `Prisma.TaskWhereInput` — a **generated type**, so an invalid
field or wrong value type is a compile error, not a runtime SQL error.
`skip`/`take` implement `page`/`limit` pagination. Running `findMany` and
`count` concurrently via `Promise.all` is a small, deliberate latency
optimization. All of this is identical to the original — this file's
Chunk 5 build note is "copy resolvers/tasks.ts but remove pubsub" —
nothing about the Prisma calls themselves changed.

## Why resolvers don't use Prisma's `include` for `Task.user`

Prisma makes it trivially easy to fetch a relation in the *same* query
(`prisma.task.findMany({ include: { user: true } })`), and it would even
be efficient — one SQL query with a JOIN, not N+1 queries itself. This
app doesn't do that because the *decision* to fetch `user` isn't Prisma's
to make — it's the GraphQL client's. A client can query `tasks { title }`
(no `user` needed) or `tasks { title user { email } }` (needs it) using
the exact same `Query.tasks` resolver. By instead giving `Task.user` its
own field resolver going through `context.loaders.userLoader`, the `user`
relation is only ever fetched when a client's query actually asks for it
— and DataLoader batches all the per-task lookups into one query anyway
when it is asked for.

## Seeding

`prisma/seed.ts` populates a demo user and a handful of tasks for local
development (`npm run seed`) — copied verbatim from the original in this
build's Chunk 2, since the data model and seed data are identical.

## Key files

| File | Role |
|---|---|
| `prisma/schema.prisma` | The single source of truth: models, relations, indexes, the datasource connection. Identical to the original. |
| `prisma/migrations/` | Generated SQL migration history, committed to the repo. |
| `prisma/seed.ts` | Standalone script seeding demo data via Prisma Client. Identical to the original. |
| `src/context.ts` | Where the single `PrismaClient` instance is constructed and attached to `GraphQLContext`. |
| `src/schema/resolvers/tasks.ts` / `auth.ts` | Every actual Prisma Client call in this app. |
| `src/loaders/userLoader.ts` | Batches `prisma.user.findMany({ where: { id: { in: [...] } } })` instead of one query per task. |
