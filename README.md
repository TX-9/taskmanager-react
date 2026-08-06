# TaskManager (React fundamentals variant)

A sibling of [`taskmanager`](../taskmanager) built without Apollo Client,
without GraphQL subscriptions, and without a normalized cache — the
frontend talks to the same kind of GraphQL API over plain `fetch`, with
every piece Apollo used to handle for free (request state, optimistic
updates, auth-error handling, pagination) written and owned by hand
instead. The point of this variant is practicing core React data-fetching
fundamentals (from [`react-practice`](../react-practice)) rather than
GraphQL/Apollo-specific patterns — see
[`../taskmanager/REBUILD_REACT.md`](../taskmanager/REBUILD_REACT.md) for
the exact chunked build plan that produced this repo, and
[`frontend/DATA_LAYER.md`](frontend/DATA_LAYER.md) /
[`frontend/OPTIMISTIC_UI.md`](frontend/OPTIMISTIC_UI.md) for a direct
comparison against what Apollo did automatically.

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

Only one transport, one direction — no WebSocket, no dual-transport
diagram to draw. The backend is Apollo Server 4 for its resolver/schema
ergonomics, same as the original; what's gone is everything Apollo Client
would have added on the frontend side.

## Docs

| Doc | What it covers |
|---|---|
| [`USE_CASES.md`](USE_CASES.md) | What this app is for, per feature — user stories mapped to the code that implements them, plus explicit non-goals (including what didn't get carried over from the original). |
| [`AUTH.md`](AUTH.md) | JWT auth from first principles, traced end-to-end from `Login.tsx` through `apiClient.ts` to `createContext`/`requireAuth` on the server — including how the original's page-refresh bug got structurally fixed here. |
| [`frontend/DATA_LAYER.md`](frontend/DATA_LAYER.md) | Why there's no normalized cache, the `AsyncState<T>` pattern, and why `TaskContext`+`useReducer` holds server data while Zustand (`filterStore`) stays scoped to pure UI state. |
| [`frontend/OPTIMISTIC_UI.md`](frontend/OPTIMISTIC_UI.md) | The apply→confirm/rollback pattern in `useTaskMutations`, snapshot-based rollback, temp-id reconciliation — contrasted directly against Apollo's `optimisticResponse`. |
| [`frontend/TESTING.md`](frontend/TESTING.md) | What's covered by the test suite and how to run it — this variant has one; the original never built one. |
| [`api/GRAPHQL.md`](api/GRAPHQL.md) | GraphQL from first principles — schema, types, resolvers, the N+1 problem, error format — grounded in this app's actual (subscription-free) schema. |
| [`api/APOLLO_SERVER.md`](api/APOLLO_SERVER.md) | What Apollo Server specifically adds on top of `graphql-js`, and why this variant's `index.ts` is much smaller with no second execution layer to feed a schema to. |
| [`api/PRISMA.md`](api/PRISMA.md) | Prisma from first principles — schema, migrations, the generated client. Identical data model to the original; barely changes here. |
| [`api/ARCHITECTURE.md`](api/ARCHITECTURE.md) | How Express and Apollo Server 4 are wired together in `api/src/index.ts` — no dual-transport diagram needed, unlike the original. |

## Repo layout

```
api/            Apollo Server 4 + Express + Prisma + Postgres GraphQL API (HTTP-only)
frontend/       React 18 + TypeScript + Tailwind SPA, hand-rolled fetch/hooks (no Apollo Client)
USE_CASES.md    What this app is for, feature by feature
AUTH.md         JWT auth, traced end-to-end from the UI to the server
```

No `.github/` CI workflow and no API deployment config (`railway.json`)
exist in this variant yet, unlike the original — only
`frontend/vercel.json` was carried over.

## Local setup

### Prerequisites

- Node.js 18+
- A local or hosted Postgres instance (or `docker run --name taskmanager-postgres -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=taskmanager -d postgres:16`)

**If you also have `taskmanager` (the original) checked out and its own
Postgres/API running**, two things will collide if you're not deliberate
about it: both `api/.env.example`s default to `PORT=4000`, and both
default `DATABASE_URL` to a database literally named `taskmanager`. This
repo's own local `.env` (gitignored, not the committed `.env.example`)
was set up pointing at a separate database — `taskmanager_react` — on the
same Postgres instance, specifically so seeding/migrating this repo never
touches the original's data. Do the same (or run a second Postgres
instance, or pick a different `PORT`) before running both side by side —
this bit the build of this very repo more than once (see
[`../taskmanager/REBUILD_REACT_PROGRESS.md`](../taskmanager/REBUILD_REACT_PROGRESS.md)'s
Chunk 11/16 notes) — whichever server binds the port first wins silently,
and the other either fails to start or, worse, you end up talking to the
wrong schema without noticing.

### 1. API

```bash
cd api
cp .env.example .env      # then edit DATABASE_URL to a distinct db name if the original is also running
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
npm run dev                 # http://localhost:5174 (or 5173 if the original's frontend isn't also running)
```

Once the API schema is stable, regenerate typed GraphQL types with:

```bash
cd frontend
npm run codegen              # requires the API running at VITE_GRAPHQL_HTTP_URL — the REAL one, see the collision note above
```

## Patterns demonstrated

Every file below carries a comment at its top identifying the pattern(s) it demonstrates.

### Backend (`api/`)

| Pattern | File |
| --- | --- |
| Apollo Server 4 + Express, HTTP-only (no WS) | `api/src/index.ts` |
| JWT auth middleware (per-request context) | `api/src/context.ts`, `api/src/utils/auth.ts` |
| DataLoader — N+1 prevention on `Task.user` | `api/src/loaders/userLoader.ts`, `api/src/schema/resolvers/tasks.ts` |
| Input validation → descriptive GraphQL errors | `api/src/utils/validation.ts`, `api/src/utils/errors.ts` |
| CORS configured via env var (`CORS_ORIGIN`) | `api/src/index.ts` |
| Prisma schema / migrations | `api/prisma/schema.prisma` |

### Frontend (`frontend/`)

**Hooks**

| Pattern | File |
| --- | --- |
| `useCallback` on task action handlers | `frontend/src/views/Dashboard.tsx` |
| `useMemo` for derived data (filter variables, client-side priority sort, Analytics breakdowns) | `frontend/src/views/Dashboard.tsx`, `frontend/src/views/Analytics.tsx` |

**Custom hooks**

| Pattern | File |
| --- | --- |
| `useAuth()` — wraps `AuthContext` | `frontend/src/hooks/useAuth.ts` |
| `useAsyncFetch(fetcher, deps)` — generic `AsyncState<T>`-returning hook for one-off reads | `frontend/src/hooks/useAsyncFetch.ts` |
| `useTasks(filter)` — hand-rolled fetch + `TaskContext` dispatch, replaces Apollo's `useQuery`/`fetchMore` | `frontend/src/hooks/useTasks.ts` |
| `useTaskMutations()` — shared `runOptimistic({apply, request, confirm, rollback})` helper | `frontend/src/hooks/useTaskMutations.ts` |
| `useDebounce(value, delay)` | `frontend/src/hooks/useDebounce.ts` |

**Component patterns**

| Pattern | File |
| --- | --- |
| `TaskCard` compound components | `frontend/src/components/TaskCard/{index,Header,Actions,Badge}.tsx` |
| Controlled form inputs | `frontend/src/views/Login.tsx`, `frontend/src/views/Register.tsx`, `frontend/src/views/Dashboard.tsx`, `frontend/src/views/Settings.tsx` |
| `withAuth` HOC (route guarding) | `frontend/src/hoc/withAuth.tsx` (used by `Settings.tsx`) |
| `<ProtectedRoute>` component (route guarding) | `frontend/src/components/Layout/ProtectedRoute.tsx` (used by `App.tsx`) |

**State management**

| Pattern | File |
| --- | --- |
| `AuthContext` via Context API | `frontend/src/context/AuthContext.tsx` |
| `TaskContext` + `useReducer` — standing in for Apollo's normalized cache | `frontend/src/context/TaskContext.tsx`, `frontend/src/context/reducers/taskReducer.ts` |
| Filter/sort state via Zustand (persists across navigation) | `frontend/src/store/filterStore.ts` |

**Performance**

| Pattern | File |
| --- | --- |
| `React.memo` on `TaskCard` + the `TaskListItem` memo-boundary wrapper | `frontend/src/components/TaskCard/index.tsx`, `frontend/src/views/Dashboard.tsx` |
| Route-level code splitting (`React.lazy`) | `frontend/src/App.tsx` (Settings, Analytics) |
| List virtualization (`@tanstack/react-virtual`, >100 items) | `frontend/src/components/List/index.tsx` |

**Data fetching (hand-rolled — no Apollo Client)**

| Pattern | File |
| --- | --- |
| `graphqlRequest` — plain `fetch` POST, JWT header, GraphQL-errors-return-HTTP-200 handling | `frontend/src/lib/apiClient.ts` |
| Optimistic create/update/toggle/delete via `runOptimistic` | `frontend/src/hooks/useTaskMutations.ts`, `frontend/src/context/reducers/taskReducer.ts` |
| Manual pagination (`loadMore` + reducer state, no `fetchMore`) | `frontend/src/hooks/useTasks.ts`, `frontend/src/context/reducers/taskReducer.ts` |

**TypeScript**

| Pattern | File |
| --- | --- |
| `AsyncState<T>` discriminated union | `frontend/src/types/async.ts` |
| Discriminated-union variant props (`TaskCard.Badge`) | `frontend/src/types/task.ts`, `frontend/src/components/TaskCard/Badge.tsx` |
| Generic `List<T>` component | `frontend/src/components/List/index.tsx` |
| Fully generic, typed custom hooks | `frontend/src/hooks/useAsyncFetch.ts`, `frontend/src/hooks/useDebounce.ts` |
| GraphQL types generated via graphql-codegen (`typescript` + `typescript-operations` only — no hooks plugin, there's no Apollo to generate hooks for) | `frontend/src/lib/codegen.ts` → `frontend/src/graphql/generated.ts` |

**Testing** (new — the original never built a test suite)

| Pattern | File |
| --- | --- |
| Pure-reducer unit tests (no mocking) | `frontend/src/context/reducers/taskReducer.test.ts` |
| Mocked-`fetch` client tests | `frontend/src/lib/apiClient.test.ts` |
| Fake-timer hook test | `frontend/src/hooks/useDebounce.test.ts` |
| Regression test for the fixed page-refresh bug | `frontend/src/context/AuthContext.test.tsx` |

> **Note on `frontend/src/graphql/generated.ts`:** same as the original —
> graphql-codegen needs a running GraphQL server to introspect, so this
> file is checked in as a hand-written placeholder (clearly labelled at
> its top) matching the shape codegen would actually emit. Run `npm run
> codegen` against the live API (mind the port-collision note above) to
> replace it with the real generated output.

> **Note on scope:** this variant intentionally has no `ErrorBoundary` —
> it was built once, then removed by request to keep the project free of
> class components (React's error-boundary API has no hook equivalent).
> It also never carried over the original Dashboard's completion-progress
> bar / document-title-update behavior — not a bug, just never part of
> this build's chunk plan. See `USE_CASES.md`'s non-goals for the full list.
