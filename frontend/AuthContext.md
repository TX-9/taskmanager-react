# AuthContext

Provides session state and auth actions (`login`, `register`, `logout`) to the entire app via React Context. Wraps the app in `main.tsx` so any component can access auth without prop drilling.

## State shape

```ts
AsyncState<User>
  | { status: "idle" }       // logged out
  | { status: "loading" }    // login/register in flight, or resolving an existing token on page load
  | { status: "success", data: User }
  | { status: "error", error: Error }
```

`AuthContextValue` also exposes two convenience derivatives computed from `state`:

| Field             | Value                                  |
|-------------------|----------------------------------------|
| `user`            | `state.data` when success, else `null` |
| `isAuthenticated` | `true` only when `state.status === "success"` |

## Initial state on page load

```ts
getAuthToken() ? { status: "loading" } : { status: "idle" }
```

If a token exists in storage the state starts as `"loading"` — there *was* a session, but it hasn't been validated yet. `useAsyncFetch(meFetcher)` resolves it:

- `me` returns a user → `{ status: "success", data: user }`
- `me` returns `null` (stale/invalid token) → `{ status: "idle" }`
- `me` throws (network error, 401) → `{ status: "idle" }` (apiClient already cleared the token and fired `AUTH_LOGOUT_EVENT`)

Without this, a page refresh with a stored token would leave the app stuck in `"loading"` forever.

## Actions

### `login(email, password)`

1. Sets state to `"loading"`.
2. Calls `graphqlRequest(LOGIN_MUTATION, { email, password })`.
3. **On success** — calls `handleAuthPayload`: stores the token via `setAuthToken`, sets state to `{ status: "success", data: user }`.
4. **On failure** — sets state to `{ status: "error", error }` **and re-throws** the normalized error.

The re-throw is critical: it lets the Login component's `catch` block set `formError` for display, while AuthContext's state is also correctly set to `"error"`. Without the re-throw, `navigate("/")` would always execute regardless of whether login succeeded.

### `register(email, password)`

Identical flow to `login`, using `REGISTER_MUTATION`. Re-throws on failure for the same reason.

### `logout()`

1. Calls `clearAuthToken()` to remove the stored token.
2. Sets state to `{ status: "idle" }`.
3. Dispatches `AUTH_LOGOUT_EVENT` on `window`.

`TaskContext` listens for the same event and resets its own state — so logout cleans up both auth and task data with a single event.

## Forced logout (token expiry / 401)

`apiClient.graphqlRequest` dispatches `AUTH_LOGOUT_EVENT` on any `401` or `UNAUTHENTICATED` GraphQL error. AuthContext listens for this event and resets to `{ status: "idle" }`. This means any request anywhere in the app can trigger a full logout without the component knowing about it.

```
window AUTH_LOGOUT_EVENT
  → AuthContext: setState({ status: "idle" })
  → TaskContext: dispatch({ type: "RESET" })
```

## Why `useAsyncFetch` for `me` but not for `login`/`register`

`useAsyncFetch` owns its async state locally via `useState`. It's a good fit for `me` because:
- It's a one-shot fetch (no pagination, no mutations).
- Its result only needs to initialize `AuthContext` state, not replace it.
- The stale-request cancellation (`cancelled` flag) is handled internally.

`login` and `register` can't use `useAsyncFetch` because they must write into the same shared `state` that `me`, `logout`, and `AUTH_LOGOUT_EVENT` all write into. There's one state atom for the whole session — `useAsyncFetch` would create a separate, disconnected one.

## Stability guarantees

- `login`, `register`, `logout` are all `useCallback` with stable deps — their references don't change between renders.
- The context value is wrapped in `useMemo` keyed on `[state, login, register, logout]` — consumers only re-render when session state actually changes.

## Usage

```ts
import { useAuth } from "../hooks/useAuth";

const { user, isAuthenticated, login, logout } = useAuth();
```

`useAuth` (in `hooks/useAuth.ts`) reads from `AuthContext` and throws if used outside `AuthProvider`.
