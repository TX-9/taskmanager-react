# useTasks

Drives the task list UI: fetches page 1 on mount or filter change, supports infinite-scroll via `loadMore`, and exposes `refetch` for post-mutation refresh. All state lives in `TaskContext` (not locally), so mutations from other hooks see the same data.

## Return shape

```ts
{
  state: AsyncState<TaskPage>   // idle | loading | error | success
  loadMore: () => void          // appends next page; no-ops if no more pages or already loading
  isLoadingMore: boolean        // true only during a loadMore fetch, not the initial fetch
  refetch: () => void           // re-fetches page 1 without changing filter/limit
}
```

`TaskPage`:
```ts
{ tasks: Task[]; totalCount: number; page: number; limit: number; hasNextPage: boolean }
```

## State ownership: TaskContext, not local state

`useTasks` dispatches into `TaskContext`'s reducer instead of managing `useState` locally. This means:

- `useTaskMutations` (create/update/delete) can write to the same list without `useTasks` needing to re-fetch.
- `AUTH_LOGOUT_EVENT` (fired on logout or 401) triggers a `RESET` dispatch in `TaskContext.tsx:21` — task data is wiped in one place regardless of what's mounted.
- Multiple components reading `useTaskContext()` see a single consistent list.

If state were local to `useTasks`, mutations in sibling components would be invisible until the next full refetch.

## Three independent fetch paths

Unlike `useAsyncFetch` (which has one trigger: `deps` change), `useTasks` has three distinct fetch paths that can't be collapsed:

| Path | Trigger | Dispatch sequence |
|------|---------|-------------------|
| Initial / filter change | `useEffect` on `[filter, limit]` | `FETCH_START` → `FETCH_SUCCESS` / `FETCH_ERROR` |
| `refetch()` | Imperative call (e.g. after mutation) | `FETCH_START` → `FETCH_SUCCESS` / `FETCH_ERROR` |
| `loadMore()` | User scrolls to end | `LOAD_MORE_START` → `LOAD_MORE_SUCCESS` / `LOAD_MORE_ERROR` |

`loadMore` is append-only: `LOAD_MORE_SUCCESS` merges the new page's tasks into the existing list rather than replacing it. `useAsyncFetch` has no concept of this.

## Stale response cancellation

The initial-fetch effect uses a `cancelled` flag (lines 44–59):

```ts
let cancelled = false;
fetchPage(1).then((data) => {
  if (!cancelled) dispatch({ type: "FETCH_SUCCESS", payload: data.tasks });
});
return () => { cancelled = true; };
```

If `filter` or `limit` changes before the in-flight request resolves, the cleanup sets `cancelled = true` and the stale result is silently dropped. The new effect fires its own fresh request. `useAsyncFetch` uses the same pattern internally.

`refetch` and `loadMore` do **not** cancel — they're imperative, so there's no cleanup lifecycle to hook into. A rapid double-tap on "load more" could dispatch twice; `loadMore` guards against this with an `isLoadingMore` check (line 64).

## `fetchFirstPage` vs the effect's inline fetch

There are two places that fetch page 1:

- The `useEffect` (lines 41–61) — runs reactively on `[filter, limit]` with stale-cancellation.
- `fetchFirstPage` (lines 30–39) — a stable `useCallback` used only by `refetch`.

They're separate because `refetch` must be callable **without** changing `filter` or `limit` (which would re-trigger the effect). Merging them would mean either losing stale-cancellation or making `refetch` impossible to call imperatively.

## State projection via `useMemo`

`TaskContext` exposes the raw `TaskState` reducer shape (which includes pagination internals like `isLoadingMore`, `page`, `hasNextPage`, etc.). `useTasks` projects this into the public `AsyncState<TaskPage>` shape (lines 80–100) so consumers get a clean, consistent interface.

`useMemo` keeps the projected object reference stable — consumers don't re-render if `taskState` changes in a way that doesn't affect the projected output.

## Comparison with AuthContext / useAsyncFetch

| | `useAsyncFetch` (used by AuthContext for `me`) | `useTasks` |
|---|---|---|
| State location | Local `useState` | Shared `TaskContext` reducer |
| Number of fetch paths | 1 (deps change) | 3 (effect, refetch, loadMore) |
| Pagination | No | Yes — appends to existing list |
| Stale cancellation | Yes (internal) | Yes (manual, effect only) |
| Mutation awareness | No | Yes — mutations dispatch into same context |
| Logout cleanup | N/A | `RESET` via `AUTH_LOGOUT_EVENT` |

`useAsyncFetch` is the right tool when a fetch is self-contained: one result, one trigger, no shared writers. `useTasks` needs the reducer + shared context pattern because the task list has multiple writers (fetch, loadMore, mutations) and must survive across component mount/unmount cycles.
