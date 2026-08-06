# Authentication: JWT, from the UI to the server

This doc traces how authentication actually works in this app, end to end
— from typing a password into `Login.tsx` to a resolver deciding whether
to let a request through. It assumes no prior JWT knowledge. The backend
half of this (Parts 1, 2, 4, 5) is identical to
[`../taskmanager/AUTH.md`](../taskmanager/AUTH.md) — the JWT mechanics
never changed, only the frontend's plumbing around them did. For the
GraphQL mechanics referenced along the way, see
[`api/GRAPHQL.md`](api/GRAPHQL.md).

## Part 1 — What a JWT actually is

**JWT** stands for JSON Web Token. It's a compact, URL-safe string — you've
seen its shape even if you didn't recognize it:

```
eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJhYmMxMjMifQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

Three dot-separated, base64url-encoded parts:

```
header.payload.signature
```

- **Header** — metadata, mainly which signing algorithm was used
  (`{"alg":"HS256"}` in this app — see `signToken` below).
- **Payload** — the actual data being asserted. In this app:
  `{"userId": "abc123", "iat": ..., "exp": ...}` (`iat`/`exp` = issued-at /
  expires-at timestamps, added automatically by the signing library).
- **Signature** — a cryptographic signature over the header+payload,
  computed with a **secret key only the server knows** (`JWT_SECRET`, see
  `api/.env.example`).

### The one thing that matters most: signed, not encrypted

**Anyone can read a JWT's payload.** Base64 is an *encoding*, not
*encryption* — paste any JWT into a decoder and the `userId` is right
there in plain text. What the signature guarantees isn't secrecy, it's
**integrity**: if you tampered with the payload (e.g. changed `userId` to
someone else's id) without knowing `JWT_SECRET`, the signature would no
longer match, and `jwt.verify()` (see `verifyToken` below) would reject
it. This app's JWT payload only ever contains a `userId` — nothing
sensitive — specifically because of this "readable by anyone" property.

### Why a JWT instead of a traditional session?

The traditional alternative is a **session**: the server generates a
random session id, stores `{ sessionId → userId }` in a database or
in-memory store, and gives the client just the id (usually via a cookie).
Every request, the server looks up that id to find out who's asking.

A JWT flips this: instead of the server storing anything, the token
*itself* carries the claim ("I am userId abc123"), cryptographically
signed so it can't be forged. The server verifies the signature — a fast,
local computation — instead of doing a database/cache lookup per request.
This app's `createContext` (Part 4) does exactly zero database queries to
authenticate a request; it only calls `verifyToken`, pure computation, no
I/O. That's the whole tradeoff: **statelessness** (no server-side session
store to maintain, easy to scale across multiple server instances) at the
cost of **no server-side revocation** (Part 5 covers this limitation).

## Part 2 — The two credential-issuing flows

### Registration

```graphql
mutation Register($email: String!, $password: String!) {
  register(email: $email, password: $password) { token user { id email } }
}
```

`Mutation.register` (`api/src/schema/resolvers/auth.ts`, copied verbatim
from the original — zero changes, this logic never depended on
subscriptions or WebSockets):

1. `validateEmail`/`validatePassword` (`api/src/utils/validation.ts`) —
   reject malformed input before touching the database.
2. Check no `User` already exists with this email; if one does, throw a
   `BAD_USER_INPUT` error (`api/src/utils/errors.ts`).
3. `hashPassword(password)` — **never** store the plaintext password.
   Uses `bcrypt.hash` (`api/src/utils/auth.ts`), which combines a random
   salt with the password and runs it through a deliberately *slow* hash
   function (10 rounds here) — slow is a feature: it makes brute-forcing a
   stolen password hash database expensive.
4. `prisma.user.create({ data: { email, passwordHash } })` — persists the
   user with the hash, never the plaintext.
5. `signToken({ userId: user.id })` — issues a JWT for the brand-new user,
   so registering also logs you in; no separate login step required.
6. Returns `{ token, user }`.

### Login

```graphql
mutation Login($email: String!, $password: String!) {
  login(email: $email, password: $password) { token user { id email } }
}
```

`Mutation.login` (same file):

1. Validate input shape (same validators as register).
2. `prisma.user.findUnique({ where: { email } })` — look up the account.
3. **If no user is found, or the password doesn't match, both cases throw
   the exact same error message** — `"Invalid email or password."` This
   closes off user-enumeration (learning which emails are registered by
   comparing error messages).
4. `verifyPassword(password, user.passwordHash)` — `bcrypt.compare`.
5. `signToken({ userId: user.id })` — same signing function as register.
6. Returns `{ token, user }`.

### `signToken`, precisely

```ts
// api/src/utils/auth.ts
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}
```

`jwt.sign` (from the `jsonwebtoken` package) builds the three-part string
described in Part 1, signed with `JWT_SECRET` (read from the environment,
never committed to the repo). `expiresIn` (default `"7d"`, configurable
via `JWT_EXPIRES_IN`) sets the `exp` claim.

## Part 3 — What the client does with the token

### Storing it

```ts
// frontend/src/lib/authToken.ts
export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}
```

`AuthContext`'s `handleAuthPayload`
(`frontend/src/context/AuthContext.tsx`) calls this immediately after
`login`/`register` resolves. `localStorage` was chosen for the same
reason as the original: it survives page reloads and tab closes with no
extra plumbing. See Part 5 for the security tradeoff this implies.

### Attaching it to every request — `graphqlRequest`

```ts
// frontend/src/lib/apiClient.ts
export async function graphqlRequest<TData, TVariables = Record<string, unknown>>(
  query: string,
  variables?: TVariables,
): Promise<TData> {
  const token = getAuthToken();
  const response = await fetch(import.meta.env.VITE_GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  // ...
}
```

The original's `authLink` ran this same "read the token, set the header"
logic as middleware Apollo Client invoked automatically before every
outgoing operation — nobody had to remember to call it. This variant has
no Apollo Link pipeline to hook into, so `graphqlRequest` does it inline,
every time it's called. The tradeoff going the other way: `graphqlRequest`
*is* the single call site every hook (`useTasks`, `useTaskMutations`,
`AuthContext`'s own `login`/`register`/`me`) goes through — there's
nowhere else a request could originate from that skips this, so in
practice it's just as automatic as the Link was, just implemented as a
shared function instead of framework middleware.

## Part 4 — What the server does with the token

### Extracting and verifying it — `createContext`

```ts
// api/src/context.ts
function extractToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim();
}

export async function createContext({ req }: { req: IncomingMessage }): Promise<GraphQLContext> {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;
  return {
    prisma,
    userId: payload?.userId ?? null,
    loaders: { userLoader: createUserLoader(prisma) },
  };
}
```

Copied verbatim from the original (see
[`api/PRISMA.md`](api/PRISMA.md)/[`api/APOLLO_SERVER.md`](api/APOLLO_SERVER.md)
for where this fits into request handling) — this runs **once per incoming
HTTP request**, before any resolver. `extractToken` strips the `"Bearer "`
prefix off the header `graphqlRequest` set. `verifyToken`:

```ts
// api/src/utils/auth.ts
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JwtPayload;
  } catch {
    return null;
  }
}
```

`jwt.verify` recomputes the signature using the server's `JWT_SECRET` and
compares it to the token's embedded signature. It throws if the signature
doesn't match or `exp` has passed — both collapsed here to a single `null`
return. No database call — verifying a JWT is pure computation.

The result — `userId: string | null` — becomes part of `GraphQLContext`,
available to every resolver as `context.userId` for the lifetime of that
one request.

### Guarding a resolver — `requireAuth`

```ts
// api/src/schema/resolvers/auth.ts
export function requireAuth(context: GraphQLContext): string {
  if (!context.userId) {
    throw authenticationError();
  }
  return context.userId;
}
```

Every mutation/query that needs a logged-in user calls this first — e.g.
`Query.tasks`, `Mutation.createTask` (`api/src/schema/resolvers/tasks.ts`).
`authenticationError()` (`api/src/utils/errors.ts`) throws a `GraphQLError`
with `extensions.code: "UNAUTHENTICATED"` — a stable, structured code the
client can branch on (Part 6) instead of parsing English text.

`Query.me` handles the one unauthenticated-is-valid case: it returns
`null` instead of throwing.

## Part 5 — Security properties, honestly

Identical tradeoffs to the original — nothing about moving off Apollo
Client changes any of these, since they're all about where the token
lives and how it's verified, not which library sends the request:

- **`localStorage` vs. an httpOnly cookie.** Storing the token in
  `localStorage` (Part 3) means any JavaScript running on the page can
  read it — including malicious script injected via an XSS vulnerability
  elsewhere in the app. The more hardened alternative is an **httpOnly
  cookie**, set by the server on login and sent automatically by the
  browser, which JavaScript categorically cannot read — at the cost of
  needing CSRF protection and `SameSite` configuration. This app took the
  simpler `localStorage` path deliberately, as a reasonable scaffold
  choice. (Unlike the original, there's no WebSocket `connectionParams`
  wrinkle to worry about here at all — one less reason cookies would add
  complexity, since there's only one transport.)
- **No revocation.** Verifying a JWT is pure computation (Part 4) with no
  database lookup, so there's no server-side record of "issued tokens" to
  invalidate. If a token leaks, it's valid until it naturally expires.
  `AuthContext.logout()` only clears the token *client-side*.
- **Generic login errors** (Part 2) intentionally prevent user
  enumeration.
- **Password hashing cost.** `bcrypt` with 10 salt rounds
  (`api/src/utils/auth.ts`) is a reasonable default; tunable.
- **The JWT payload is minimal on purpose** (Part 1) — just `userId`.

## Part 6 — What happens when things go wrong

### Token missing or invalid on a protected query

1. `graphqlRequest` finds no token in `localStorage` (or a stale/invalid
   one is sent) → request goes out with no `Authorization` header, or one
   the server will fail to verify.
2. `createContext` → `verifyToken` returns `null` → `context.userId` is
   `null`.
3. The resolver calls `requireAuth(context)` → throws `UNAUTHENTICATED`.
4. The GraphQL response comes back **HTTP 200** (GraphQL errors don't use
   HTTP status codes — see [`api/GRAPHQL.md`](api/GRAPHQL.md)) with
   `data: null` and an `errors` array containing the `UNAUTHENTICATED`
   code — *or*, in some deployments, middleware might reject the request
   at the HTTP layer directly with a bare 401 before it ever reaches
   GraphQL. `graphqlRequest` checks **both**:
   ```ts
   // frontend/src/lib/apiClient.ts
   if (response.status === 401) {
     forceLogout();
     throw toApiError("Your session has expired. Please log in again.", "UNAUTHENTICATED", 401);
   }
   // ...
   if (firstError) {
     if (firstError.extensions?.code === "UNAUTHENTICATED") {
       forceLogout();
     }
     throw toApiError(firstError.message, firstError.extensions?.code, ...);
   }
   ```
5. `forceLogout()` clears the token and dispatches `AUTH_LOGOUT_EVENT`.
   `AuthContext` has a listener for that exact event that resets `state`
   to `{ status: "idle" }` — same event `AuthContext.logout()` itself
   dispatches on a user-initiated logout, and the same event
   `TaskContext` listens for to reset its own task list (`RESET` action,
   `frontend/src/context/reducers/taskReducer.ts`) — one event, three
   listeners, instead of the original's `errorLink` (auth reset) plus
   `apolloClient.clearStore()` (cache reset) being two separate mechanisms.
6. `<ProtectedRoute>`/`withAuth` (both read `isAuthenticated` from
   `AuthContext`) redirect to `/login` on their next render.

### Token expires mid-session

Same as the original: nothing proactively checks expiry client-side. The
token simply stops verifying successfully server-side once `exp` passes;
the *next* request made with it triggers the flow above.

### ✅ Fixed: page refresh with an existing-but-unconfirmed token

The original shipped with a documented `⚠️ KNOWN GAP`: on mount, if a
token existed, `AuthContext` set `state` to `{ status: "loading" }`
(reasonable — the token *might* still be valid) but nothing ever resolved
it one way or the other, since no component called the already-working
`Query.me`. A page refresh with a stored token left the app stuck on a
loading spinner indefinitely.

This variant actually closes that gap, structurally:

```ts
// frontend/src/context/AuthContext.tsx
const meFetcher = useCallback(async (): Promise<User | null> => {
  if (!getAuthToken()) {
    return null;
  }
  const data = await graphqlRequest<MeQuery>(ME_QUERY);
  return data.me;
}, []);
const { state: meState } = useAsyncFetch<User | null>(meFetcher, []);

useEffect(() => {
  if (meState.status === "success") {
    setState(meState.data ? { status: "success", data: meState.data } : { status: "idle" });
  } else if (meState.status === "error") {
    setState({ status: "idle" });
  }
}, [meState]);
```

`useAsyncFetch` (`frontend/src/hooks/useAsyncFetch.ts`) runs `meFetcher` on
mount. Three outcomes, all handled:

- No token at all → `meFetcher` skips the network call entirely, resolves
  `null` immediately. (`state` already started `"idle"` in this case —
  nothing to resolve.)
- A token exists and `Query.me` returns a real user → `state` resolves to
  `"success"`.
- A token exists but is stale/invalid → `Query.me` returns `null` (or the
  request itself fails with `UNAUTHENTICATED`, which `graphqlRequest`
  already turned into a `forceLogout()`) → `state` resolves to `"idle"`
  either way, never stuck.

`frontend/src/context/AuthContext.test.tsx` (Chunk 25) is a regression
test specifically for this — it asserts a mount with a stored token
actually reaches `"success"`/`"idle"`, not just that the code compiles.

## Part 7 — Key files, in the order this doc covers them

| File | Role |
|---|---|
| `api/prisma/schema.prisma` | `User.passwordHash` — never a plaintext `password` column. Identical to the original. |
| `api/src/utils/auth.ts` | `hashPassword`/`verifyPassword` (bcrypt), `signToken`/`verifyToken` (jsonwebtoken). Copied verbatim. |
| `api/src/utils/validation.ts` | `validateEmail`/`validatePassword`. Copied verbatim. |
| `api/src/utils/errors.ts` | `authenticationError()` — the `UNAUTHENTICATED` `GraphQLError` factory. Copied verbatim. |
| `api/src/schema/resolvers/auth.ts` | `login`/`register`/`me` resolvers, plus `requireAuth()`. Copied verbatim. |
| `api/src/context.ts` | `createContext` — extracts + verifies the token once per HTTP request. Copied verbatim. |
| `frontend/src/lib/authToken.ts` | Token storage (`getAuthToken`/`setAuthToken`/`clearAuthToken`) and the `AUTH_LOGOUT_EVENT` constant — extracted from the original's `apollo.ts`, everything Apollo-specific left behind. |
| `frontend/src/lib/apiClient.ts` | `graphqlRequest` — attaches the header, detects both HTTP-401 and GraphQL-layer `UNAUTHENTICATED`, calls `forceLogout()`. Replaces `authLink`+`errorLink`. |
| `frontend/src/context/AuthContext.tsx` | `login`/`register`/`logout`, the `AsyncState<User>` session state, and the **fixed** page-refresh resolution via `useAsyncFetch`. |
| `frontend/src/hooks/useAuth.ts` | The `useContext(AuthContext)` wrapper every component actually calls. |
| `frontend/src/components/Layout/ProtectedRoute.tsx` / `frontend/src/hoc/withAuth.tsx` | Two different patterns for gating a route on `isAuthenticated`. |
| `frontend/src/views/Login.tsx` / `frontend/src/views/Register.tsx` | The UI surfaces that call `login()`/`register()`, cross-linked to each other. |
