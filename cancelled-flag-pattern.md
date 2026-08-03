# The `cancelled` Flag Pattern in `useAsyncFetch`

## Problem

When a component unmounts (or its dependencies change) while an async request is still in-flight, the `.then()` or `.catch()` callback may still fire and call `setState` on a component that no longer exists. This causes stale state updates and the classic React warning:

> Warning: Can't perform a React state update on an unmounted component.

## Solution

`useAsyncFetch` uses a local boolean flag (`cancelled`) to guard every state update inside the async callbacks.

```ts
const run = useCallback(() => {
  let cancelled = false;
  setState({ status: "loading" });

  fetcherRef
    .current()
    .then((data) => {
      if (!cancelled) {                          // guard
        setState({ status: "success", data });
      }
    })
    .catch((error: unknown) => {
      if (!cancelled) {                          // guard
        setState({ status: "error", error: ... });
      }
    });

  return () => {
    cancelled = true;                            // cleanup sets the flag
  };
}, []);

useEffect(() => {
  return run();   // useEffect uses the returned cleanup function
}, deps);
```

## How It Works

1. Each call to `run()` creates a **new closure** with its own `cancelled = false`.
2. `run()` returns a cleanup function `() => { cancelled = true }`.
3. React calls that cleanup automatically when:
   - The component **unmounts**, or
   - The `deps` array changes (triggering a re-run of the effect).
4. When the in-flight request eventually resolves, `!cancelled` is `false`, so `setState` is skipped.

## Why a Flag Instead of `AbortController`?

An `AbortController` actually cancels the network request. The `cancelled` flag does not — it lets the request finish but **ignores the result**. This is simpler and sufficient for most cases where you only care about preventing stale state, not saving bandwidth.

Use `AbortController` when you also need to cancel the underlying fetch (e.g. large downloads, expensive queries).

## Example Scenario

```
t=0   Component mounts, effect runs → run() called, cancelled=false, fetch starts
t=1   User navigates away → component unmounts → cleanup runs → cancelled=true
t=2   Fetch resolves → .then() fires → cancelled is true → setState skipped ✓
```

Without the flag, the `setState` at `t=2` would update state on an unmounted component.
