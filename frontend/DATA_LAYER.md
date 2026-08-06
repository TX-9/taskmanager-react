# The data layer: `apiClient.ts`, no cache, `AsyncState<T>`, and where server data actually lives

No direct equivalent in the original — this doc explains the genuinely new
parts of this variant's frontend. If you haven't read
[`../../taskmanager/frontend/DASHBOARD.md`](../../taskmanager/frontend/DASHBOARD.md)
(the original's from-scratch Apollo Client primer), the contrasts below
will make more sense with that as a reference point, but it isn't required.

## `apiClient.ts` — what it is, and what it deliberately isn't

```ts
// frontend/src/lib/apiClient.ts
export async function graphqlRequest<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables,
): Promise<TData> {
  const token = getAuthToken();
  const response = await fetch(import.meta.env.VITE_GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  // ...checks response.status, then body.errors[]...
  return body.data as TData;
}
```

That's the entire client. One function: POST a GraphQL document + variables,
attach the JWT, check both HTTP-layer and GraphQL-layer failure, return
`data` or throw. Every hook in this app (`useTasks`, `useTaskMutations`,
`useAsyncFetch`-based reads, `AuthContext`'s `login`/`register`/`me`) calls
this directly. There is no client *instance* to construct, no link chain,
no cache to configure — `graphqlRequest` is a plain async function, not an
object with internal state.

What Apollo Client is, by contrast (see `DASHBOARD.md`'s Part 1): a
long-lived object holding a **normalized cache** — a flat table of every
`Task`/`User` entity ever fetched, keyed by `"Type:id"` — plus a link
chain that intercepts every request/response to read from and write into
that cache automatically. `graphqlRequest` has none of that. It doesn't
remember anything between calls. Two calls to `graphqlRequest(TASKS_QUERY,
...)` a second apart hit the network twice, full stop — there's no cache
to check first.

## Why there's no normalized cache

This is the single biggest structural difference, and it's deliberate, not
a missing feature to add later. Consequences worth naming plainly:

- **No cross-component data sharing.** In the original, `Task:a1` exists
  exactly once in Apollo's cache — if Dashboard's list and some other
  hypothetical view both reference it, editing it through either one
  updates both, automatically, because they're reading the same entity.
  Here, `Dashboard` (via `TaskContext`, populated by `useTasks`) and
  `Analytics` (via its own standalone `useAsyncFetch` call) each hold
  their **own independent copy** of whatever tasks they fetched. Toggling
  a task's status on Dashboard does not update Analytics' already-fetched
  breakdown until Analytics happens to refetch (e.g. on next mount).
  Worth noting for fairness: the original had a version of this same gap
  too — its `Analytics.tsx` intentionally issued its own network request
  rather than reusing Dashboard's cached result, because Apollo's cache
  key (`keyArgs: ["filter"]`) still distinguished Dashboard's `{filter:
  {}}` from Analytics' omitted-`filter` call. The difference here is one
  of degree, not kind: nothing is ever shared, versus most things
  incidentally were.
- **No automatic re-render on unrelated changes.** Apollo's `useQuery`
  keeps a live subscription to the cache; any write anywhere that touches
  a field a component is watching triggers a re-render for that component,
  with zero code written for it. Here, a component only ever re-renders
  because *its own* hook (`useTasks`, `useAsyncFetch`) explicitly received
  new data via its own request or its own `TaskContext` dispatch. This is
  strictly less magic — also strictly more code, since every one of those
  paths (fetch effects, reducer dispatches) had to be written by hand
  (`useTasks.ts`, `taskReducer.ts`, `useAsyncFetch.ts`).
- **No automatic pagination merge.** Apollo's `fetchMore` merges a new
  page into the existing cached list via `updateQuery`, transparently.
  `useTasks.ts`'s `loadMore` does the equivalent by hand — dispatching
  `LOAD_MORE_START`/`LOAD_MORE_SUCCESS` into `taskReducer`, which appends
  `action.payload.tasks` onto `state.tasks` itself (see
  `context/reducers/taskReducer.ts`).

## `AsyncState<T>` — one discriminated union instead of three independent booleans

```ts
// frontend/src/types/async.ts
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: Error };
```

Apollo's `useQuery` returns `{ loading, error, data }` — three fields that
can, in principle, all be true/present/undefined in combinations that
don't actually make sense (`loading: true` while `data` is already
populated from a previous fetch, for instance — Apollo handles this
correctly internally, but the *type* doesn't prevent a caller from
mishandling it). `AsyncState<T>` makes the four legal states — nothing
happened yet, in flight, succeeded with data, failed with an error — the
*only* representable shapes. `useAsyncFetch` (Chunk 14) and `useTasks`
(Chunk 18) both translate whatever they're doing internally (a fetch
promise, or `TaskContext`'s reducer state) into this one shape, so every
consuming component checks a single `state.status` instead of juggling
independent booleans.

## Why `TaskContext` + `useReducer` holds server data, while Zustand (`filterStore`) stays scoped to UI state

Two different kinds of state, deliberately kept in two different
containers:

- **`TaskContext`** (`context/TaskContext.tsx` + `context/reducers/
  taskReducer.ts`) holds the task list, pagination, and in-flight
  optimistic-operation bookkeeping — data that originated on the server
  and that multiple hooks need to read *and write* consistently.
  `useTasks` populates it; `useTaskMutations` mutates it; both need to see
  the *same* list, which is exactly the role Apollo's normalized cache
  played in the original (see `context/TaskContext.tsx`'s own top
  comment). A reducer was the right tool here specifically because
  optimistic updates need transactional apply→confirm/rollback semantics
  (see `OPTIMISTIC_UI.md`) — `useState` alone doesn't give you anywhere
  natural to put "undo this specific in-flight change."
- **`filterStore`** (`store/filterStore.ts`) holds `statusFilter`/
  `priorityFilter`/`prioritySort`/`searchQuery` — pure client-side
  *preferences* about how to view data that already lives elsewhere.
  Nothing here was ever fetched from the server, nothing here needs
  rollback semantics, and it needs to persist across route navigation
  (Dashboard → Analytics → back) without resetting — exactly what
  Zustand's `persist` middleware is for. It was a deliberate choice
  *not* to fold this into `TaskContext`: doing so would blur "what did the
  server tell us" against "what does the user currently want to see,"
  two concerns that should be able to change independently (switching
  filters doesn't invalidate the fetched data, it just changes what's
  requested next).

The dividing line, stated plainly: if it came from the API and something
needs to optimistically mutate it, it's in `TaskContext`. If it's a
client-only preference about how to look at data, it's in `filterStore`.
`AuthContext` is its own third case — session state, `useState` +
`useAsyncFetch`, covered in [`../AUTH.md`](../AUTH.md).
