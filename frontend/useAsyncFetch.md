# useAsyncFetch

A generic hook that wraps any async call and exposes its lifecycle as a type-safe `AsyncState<T>` discriminated union.

---

## Problem 1: Impossible states with raw booleans

### Without

Three independent booleans have no constraint between them. TypeScript cannot prevent you from reading `data` while `loading` is true, and you can end up with combinations that should never exist.

```tsx
function TaskList({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState<Task[] | null>(null);
  const [error, setError]     = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchTasks(userId)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [userId]);

  // ❌ loading=true AND data=[...] is a valid state — TypeScript won't stop you
  if (loading) return <Spinner />;
  if (error)   return <ErrorBanner error={error} />;
  return <List items={data!} />; // forced non-null assertion, no compile-time guarantee
}
```

### With

`AsyncState<T>` is a discriminated union. Each `status` value is its own object shape. TypeScript narrows the type when you check `status`, making `data` only accessible in the `"success"` branch and `error` only in `"error"`.

```tsx
function TaskList({ userId }: { userId: string }) {
  const { state } = useAsyncFetch(() => fetchTasks(userId), [userId]);

  if (state.status === "loading") return <Spinner />;
  if (state.status === "error")   return <ErrorBanner error={state.error} />;
  if (state.status === "idle")    return null;

  // ✅ TypeScript knows state.data exists — no assertion needed
  return <List items={state.data} />;
}
```

---

## Problem 2: Race conditions from stale responses

### Without

If `userId` changes before the first request resolves, the slow first response can overwrite the result of the faster second request. The UI ends up showing data for the wrong user.

```tsx
useEffect(() => {
  setLoading(true);
  fetchTasks(userId).then((data) => {
    // ❌ userId may have changed by now.
    // If request-1 (slow) resolves after request-2 (fast),
    // the UI is left showing request-1's stale data.
    setData(data);
    setLoading(false);
  });
}, [userId]);
```

### With

`run()` captures a `cancelled` flag in its closure and returns a cleanup function. When `deps` change (or the component unmounts), React calls the cleanup, which sets `cancelled = true`. The `.then()` / `.catch()` callbacks check the flag and discard any stale result.

```ts
// Inside useAsyncFetch
const run = useCallback(() => {
  let cancelled = false;
  setState({ status: "loading" });

  fetcherRef.current()
    .then((data) => {
      if (!cancelled) setState({ status: "success", data }); // ✅ only applied if still current
    })
    .catch((error: unknown) => {
      if (!cancelled) setState({ status: "error", error: error instanceof Error ? error : new Error("Request failed.") });
    });

  return () => { cancelled = true; }; // React calls this on cleanup
}, []);
```

---

## Problem 3: Infinite refetch from inline functions

### Without

Passing `fetcher` directly as an effect dependency causes the effect to re-run on every render, because every render creates a new function reference even if nothing relevant changed.

```ts
// ❌ Every render creates a new `fetcher` reference.
// Putting it in deps means the effect refires every render — an infinite loop.
useEffect(() => {
  fetcher().then(setData);
}, [fetcher]); // re-runs on every render
```

### With

`fetcherRef` stores the latest version of `fetcher` without making it a dependency. The effect only re-runs when `deps` (caller-supplied) changes, but always invokes the current `fetcher`.

```ts
const fetcherRef = useRef(fetcher);
fetcherRef.current = fetcher; // updated every render — no stale closure

const run = useCallback(() => {
  fetcherRef.current(); // always calls the latest fetcher
}, []); // ✅ stable — empty dep list, no refetch loop

useEffect(() => {
  return run();
}, deps); // only the caller's deps control when to refetch
```

---

## Problem 4: Boilerplate duplicated across every component

### Without

Every component that fetches data must manually manage three state variables, write the same effect, handle errors, and clean up on unmount.

```tsx
// Repeated in every data-fetching component
const [loading, setLoading] = useState(false);
const [data, setData]       = useState<Task[] | null>(null);
const [error, setError]     = useState<Error | null>(null);

useEffect(() => {
  let active = true;
  setLoading(true);
  fetchTasks(userId)
    .then((d) => { if (active) { setData(d); setLoading(false); } })
    .catch((e) => { if (active) { setError(e); setLoading(false); } });
  return () => { active = false; };
}, [userId]);
```

### With

One hook call replaces all of it. The `<T>` type parameter gives full inference on `state.data` at the call site.

```tsx
const { state, refetch } = useAsyncFetch(
  () => fetchTasks(userId),
  [userId],
);
```

---

## Problem 5: No way to re-trigger a fetch after a mutation

### Without

To force a re-fetch you need a dummy counter in state and increment it in the effect's dependency array — an awkward convention that isn't self-documenting.

```tsx
const [tick, setTick] = useState(0);

useEffect(() => {
  fetchTasks(userId).then(setData);
}, [userId, tick]); // ❌ `tick` is a workaround, not intent

const refetch = () => setTick((t) => t + 1);
```

### With

`refetch()` is a stable callback returned directly by the hook. Call it after any mutation to re-run the latest fetch without touching state yourself.

```tsx
const { state, refetch } = useAsyncFetch(() => fetchTasks(userId), [userId]);

async function handleDelete(id: string) {
  await deleteTask(id);
  refetch(); // ✅ explicit, readable, no counter tricks
}
```

---

## AuthContext end-to-end flow

`AuthProvider` owns two separate pieces of async state that interact: `state` (the authoritative session state exposed to the rest of the app) and `meState` (the result of the one-time `me` fetch on mount). `useAsyncFetch` drives the second one.

### 1. Initial render

```ts
const [state, setState] = useState<AsyncState<User>>(() =>
  getAuthToken() ? { status: "loading" } : { status: "idle" },
);
```

- **Token exists** → start as `"loading"`. The app knows there *was* a session; it just hasn't confirmed it yet.
- **No token** → start as `"idle"`. No session, nothing to resolve.

### 2. `useAsyncFetch` mounts

```ts
const meFetcher = useCallback(async (): Promise<User | null> => {
  if (!getAuthToken()) return null;           // short-circuit: no token, skip the network call
  const data = await graphqlRequest<MeQuery>(ME_QUERY);
  return data.me;
}, []);

const { state: meState } = useAsyncFetch<User | null>(meFetcher, []);
```

`useAsyncFetch` is called with `[]` deps, so its internal `useEffect` fires once on mount and calls `run()`.

`setState` inside `run()` does **not** re-render `AuthProvider` immediately — it schedules a re-render and returns. The rest of `run()` keeps executing on the same call stack:

```ts
const run = useCallback(() => {
  let cancelled = false;
  setState({ status: "loading" });   // 1. schedules re-render, returns immediately
  fetcherRef.current()               // 2. kicks off the async fetch (also returns immediately)
    .then(...)
    .catch(...);
  return () => { cancelled = true }; // 3. returns cleanup — run() is done
}, []);
```

In React 18, state updates inside effects are batched — React waits until the effect handler exits, then flushes all pending updates in one pass.

**Important:** `setState` inside `useAsyncFetch` updates `meState` only — not `state`. These are two separate slots on `AuthProvider`'s fiber:

```
AuthProvider fiber node
  ├── slot 1: state     ← AuthProvider's own useState (what consumers read)
  └── slot 2: meState   ← useAsyncFetch's internal useState
```

Because of this, `AuthProvider` re-renders **three** times in total — `meState` and `state` update in separate passes, bridged by `useEffect([meState])`:

```
useEffect fires → run() called
  → setState("loading")     schedules update to slot 2 (meState)
  → fetch starts            (async, goes to microtask queue)
  → cleanup fn returned
effect handler exits
  ↓
React flushes → AuthProvider re-render #1
  meState = "loading", state still "loading" (unchanged)
  ↓
... later, fetch resolves ...
  → setState("success") inside useAsyncFetch  →  schedules update to slot 2 (meState)
  ↓
React flushes → AuthProvider re-render #2
  meState = "success"
  useEffect([meState]) sees the change → fires
    → setState({ status: "success", data })   schedules update to slot 1 (state)
  ↓
React flushes → AuthProvider re-render #3
  state = "success"
  useMemo recomputes context value → consumers re-render
```

`useEffect([meState])` is the bridge — without it, `state` (what the rest of the app reads) would never change. `meState` updating alone has no effect on `state`.

### 3. `meFetcher` resolves

Two paths depending on what the server returns:

```
Token valid   → graphqlRequest resolves with { me: User }
              → setState({ status: "success", data: user })   ← inside useAsyncFetch
              → AuthProvider re-renders; meState = { status: "success", data: user }

Token stale / no token → meFetcher returns null
              → setState({ status: "success", data: null })
              → AuthProvider re-renders; meState = { status: "success", data: null }

Network / auth error  → graphqlRequest throws
              → setState({ status: "error", error })
              → AuthProvider re-renders; meState = { status: "error", error }
```

### 4. `useEffect([meState])` reacts

```ts
useEffect(() => {
  if (meState.status === "success") {
    setState(meState.data
      ? { status: "success", data: meState.data }  // valid session → logged in
      : { status: "idle" });                        // null user → stale token → logged out
  } else if (meState.status === "error") {
    setState({ status: "idle" });                   // unresolvable → treat as logged out
  }
}, [meState]);
```

This is the bridge: `meState` (owned by `useAsyncFetch`) feeds into `state` (the value the rest of the app actually reads).

### 5. Context value propagates

```ts
const value = useMemo(() => ({
  state,
  user: state.status === "success" ? state.data : null,
  isAuthenticated: state.status === "success",
  login, register, logout,
}), [state, login, register, logout]);
```

`useMemo` means consumers only re-render when `state` (or the callbacks) actually change — not on every `AuthProvider` render.

---

### Login / Register flow

```
user submits form
  → login() / register() called
  → setState({ status: "loading" })        ← AuthProvider re-renders
  → graphqlRequest fires mutation
  → on success: handleAuthPayload(payload)
      → setAuthToken(payload.token)         ← persists to localStorage
      → setState({ status: "success", data: payload.user })
  → on error: setState({ status: "error", error })
              throw error                   ← caller (LoginPage) can catch and show message
```

### Logout flow

Two triggers, same end state:

```
A. User-initiated: logout() called
     → clearAuthToken()
     → setState({ status: "idle" })
     → window.dispatchEvent(AUTH_LOGOUT_EVENT)

B. Forced (401 / UNAUTHENTICATED from any request):
     → apiClient.ts dispatches AUTH_LOGOUT_EVENT
     → AuthProvider's listener: setState({ status: "idle" })

Both paths → TaskContext also listens for AUTH_LOGOUT_EVENT and resets its own state
```

### Full state machine

```
                     ┌─────────────────────────────────────────┐
         no token    │                                         │  logout() / 401
         on mount    ▼                                         │
               ┌──────────┐    login() / register()    ┌──────────────┐
               │  "idle"  │ ────────────────────────► │  "loading"   │
               └──────────┘                            └──────────────┘
                    ▲                                         │
                    │  meState null / error                   │ success
                    │  logout() / 401                         ▼
                    │                                  ┌──────────────┐
                    └─────────────────────────────────│  "success"   │
                                                       └──────────────┘
```

---

## Mental model: hooks don't render, components do

`useAsyncFetch` is a function, not a component. It has no entry in the React component tree and no render cycle of its own.

The `useState` inside `useAsyncFetch` does **not** live in the hook file. React stores it on the fiber node of whichever component called the hook. If `AuthProvider` calls `useAsyncFetch`, that state slot belongs to `AuthProvider`.

```
// What it looks like                 // What React actually does
useAsyncFetch.ts                       AuthProvider fiber node
  useState(...)  ──────────────────►  [ meState slot ]
                                       [ state slot   ]
                                       [ ...          ]
```

When the `me` fetch resolves and `setState` fires inside `useAsyncFetch`, React sees new state on **`AuthProvider`'s** fiber and re-renders `AuthProvider`. During that re-render, `AuthProvider`'s function body runs top-to-bottom, which includes calling `useAsyncFetch()` again — not as a separate render, but as an ordinary function call. `useAsyncFetch` returns the updated `state`, and the caller sees it as the new `meState`.

There is no "re-render of `useAsyncFetch`" — the hook simply runs again as part of the component's render pass.
