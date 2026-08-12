# TaskManager

A full-stack task manager: a GraphQL API (Apollo Server 4 + Express +
Prisma + Postgres) and a React 18 frontend that talks to it over plain
`fetch` — no Apollo Client, no normalized cache, no external data-fetching
library. Request state, optimistic updates, pagination, and auth-error
handling are all written by hand: a small `graphqlRequest` client, custom
hooks, and a `useReducer` + Context store standing in for what a library
like Apollo Client or React Query would otherwise provide.

## Architecture

```
                              ┌─────────────────────────────┐
                              │           Browser            │
                              │  React 18 + hand-rolled       │
                              │  fetch/hooks (frontend/)      │
                              └───────────────┬──────────────┘
                                              │
                                   HTTPS (queries/mutations)
                                              │
                              ┌───────────────▼──────────────┐
                              │     Express + Apollo Server 4  │
                              │      GraphQL API, HTTP-only     │
                              │           (api/)                 │
                              │                                 │
                              │  ┌───────────┐  ┌────────────┐ │
                              │  │  Resolvers │  │ DataLoader │ │
                              │  │ (auth,     │◄─┤ (batches   │ │
                              │  │  tasks)    │  │  user       │ │
                              │  └─────┬─────┘  │  lookups)  │ │
                              │        │        └────────────┘ │
                              │  ┌─────▼─────┐                 │
                              │  │  JWT auth  │                 │
                              │  │ middleware │                 │
                              │  └───────────┘                 │
                              └───────────────┬──────────────┘
                                              │
                                    Prisma Client (SQL)
                                              │
                              ┌───────────────▼──────────────┐
                              │         PostgreSQL            │
                              │      (users, tasks tables)    │
                              └───────────────────────────────┘
```

One transport, one direction: every operation is a single HTTP request/
response, no WebSocket. The API is GraphQL for its resolver/schema
ergonomics — one endpoint, typed arguments, a client that asks for exactly
the fields it needs.

## Repo layout

```
api/            Apollo Server 4 + Express + Prisma + Postgres GraphQL API (HTTP-only)
frontend/       React 18 + TypeScript + Tailwind SPA, hand-rolled fetch/hooks (no Apollo Client)
```

No CI workflow or API deployment config exists yet — `frontend/vercel.json`
configures a Vercel static build (SPA rewrites, env vars), but there's no
equivalent for the API yet.

## Local setup

### Prerequisites

- Node.js 18+
- A local or hosted Postgres instance (or `docker run --name taskmanager-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=taskmanager -d postgres:16`)

### 1. API

```bash
cd api
cp .env.example .env      # defaults: DB "taskmanager", PORT 4000 — edit if either is already taken locally
npm install
npm run prisma:migrate    # creates the database schema
npm run seed               # optional: seeds a demo@taskmanager.dev user (password: password123)
npm run dev                 # http://localhost:4000/graphql
```

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Once the API schema changes, regenerate typed GraphQL types with:

```bash
cd frontend
npm run codegen              # requires the API running at VITE_GRAPHQL_HTTP_URL
```

## Patterns demonstrated

Every file below carries a comment at its top identifying the pattern(s) it demonstrates.

### Backend (`api/`)

| Pattern                                       | File                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Apollo Server 4 + Express, HTTP-only          | `api/src/index.ts`                                                   |
| JWT auth middleware (per-request context)     | `api/src/context.ts`, `api/src/utils/auth.ts`                        |
| DataLoader — N+1 prevention on `Task.user`    | `api/src/loaders/userLoader.ts`, `api/src/schema/resolvers/tasks.ts` |
| Input validation → descriptive GraphQL errors | `api/src/utils/validation.ts`, `api/src/utils/errors.ts`             |
| CORS configured via env var (`CORS_ORIGIN`)   | `api/src/index.ts`                                                   |
| Prisma schema / migrations                    | `api/prisma/schema.prisma`                                           |

### Frontend (`frontend/`)

**Hooks**

| Pattern                                                                                        | File                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `useCallback` on task action handlers                                                          | `frontend/src/views/Dashboard.tsx`                                     |
| `useMemo` for derived data (filter variables, client-side priority sort, Analytics breakdowns) | `frontend/src/views/Dashboard.tsx`, `frontend/src/views/Analytics.tsx` |

**Custom hooks**

| Pattern                                                                                   | File                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| `useAuth()` — wraps `AuthContext`                                                         | `frontend/src/hooks/useAuth.ts`          |
| `useAsyncFetch(fetcher, deps)` — generic `AsyncState<T>`-returning hook for one-off reads | `frontend/src/hooks/useAsyncFetch.ts`    |
| `useTasks(filter)` — fetches a page of tasks and dispatches the result into `TaskContext` | `frontend/src/hooks/useTasks.ts`         |
| `useTaskMutations()` — shared `runOptimistic({apply, request, confirm, rollback})` helper | `frontend/src/hooks/useTaskMutations.ts` |
| `useDebounce(value, delay)`                                                               | `frontend/src/hooks/useDebounce.ts`      |

**Component patterns**

| Pattern                                       | File                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `TaskCard` compound components                | `frontend/src/components/TaskCard/{index,Header,Actions,Badge}.tsx`                                                                      |
| Controlled form inputs                        | `frontend/src/views/Login.tsx`, `frontend/src/views/Register.tsx`, `frontend/src/views/Dashboard.tsx`, `frontend/src/views/Settings.tsx` |
| `withAuth` HOC (route guarding)               | `frontend/src/hoc/withAuth.tsx` (used by `Settings.tsx`)                                                                                 |
| `<ProtectedRoute>` component (route guarding) | `frontend/src/components/Layout/ProtectedRoute.tsx` (used by `App.tsx`)                                                                  |

**State management**

| Pattern                                                                | File                                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `AuthContext` via Context API                                          | `frontend/src/context/AuthContext.tsx`                                                 |
| `TaskContext` + `useReducer` — owns the task list and optimistic state | `frontend/src/context/TaskContext.tsx`, `frontend/src/context/reducers/taskReducer.ts` |
| Filter/sort state via Zustand (persists across navigation)             | `frontend/src/store/filterStore.ts`                                                    |

**Performance**

| Pattern                                                               | File                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `React.memo` on `TaskCard` + the `TaskListItem` memo-boundary wrapper | `frontend/src/components/TaskCard/index.tsx`, `frontend/src/views/Dashboard.tsx` |
| Route-level code splitting (`React.lazy`)                             | `frontend/src/App.tsx` (Settings, Analytics)                                     |
| List virtualization (`@tanstack/react-virtual`, >100 items)           | `frontend/src/components/List/index.tsx`                                         |

**Data fetching**

| Pattern                                                                                    | File                                                                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `graphqlRequest` — plain `fetch` POST, JWT header, GraphQL-errors-return-HTTP-200 handling | `frontend/src/lib/apiClient.ts`                                                          |
| Optimistic create/update/delete via `runOptimistic`                                        | `frontend/src/hooks/useTaskMutations.ts`, `frontend/src/context/reducers/taskReducer.ts` |
| Manual pagination (`loadMore` + reducer state)                                             | `frontend/src/hooks/useTasks.ts`, `frontend/src/context/reducers/taskReducer.ts`         |

**TypeScript**

| Pattern                                                                                                                                                | File                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `AsyncState<T>` discriminated union                                                                                                                    | `frontend/src/types/async.ts`                                              |
| Discriminated-union variant props (`TaskCard.Badge`)                                                                                                   | `frontend/src/types/task.ts`, `frontend/src/components/TaskCard/Badge.tsx` |
| Generic `List<T>` component                                                                                                                            | `frontend/src/components/List/index.tsx`                                   |
| Fully generic, typed custom hooks                                                                                                                      | `frontend/src/hooks/useAsyncFetch.ts`, `frontend/src/hooks/useDebounce.ts` |
| GraphQL types generated via graphql-codegen (`typescript` + `typescript-operations` — schema types plus per-operation `TData`/`TVariables` interfaces) | `frontend/src/lib/codegen.ts` → `frontend/src/graphql/generated.ts`        |

**Testing**

| Pattern                                          | File                                                |
| ------------------------------------------------ | --------------------------------------------------- |
| Pure-reducer unit tests (no mocking)             | `frontend/src/context/reducers/taskReducer.test.ts` |
| Mocked-`fetch` client tests                      | `frontend/src/lib/apiClient.test.ts`                |
| Fake-timer hook test                             | `frontend/src/hooks/useDebounce.test.ts`            |
| Regression test for the page-refresh session fix | `frontend/src/context/AuthContext.test.tsx`         |

> **Note on `frontend/src/graphql/generated.ts`:** graphql-codegen needs a
> running GraphQL server to introspect, so this file is checked in as a
> hand-written placeholder (clearly labelled at its top) matching the shape
> codegen would actually emit. Run `npm run codegen` against your running
> API to replace it with the real generated output.
