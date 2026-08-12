# Testing

No equivalent in the original — `taskmanager` never built a test suite
(see [`../../taskmanager/api/PRISMA.md`](../../taskmanager/api/PRISMA.md)
et al. for its docs, none of which cover tests, because there aren't any
to cover). This variant does, added in one pass (Chunk 25) once the app
was fully wired end to end. Vitest + React Testing Library, with the test
setup itself deferred from Chunk 7 (when the dependencies were installed)
to Chunk 25 (when there was finally something worth testing).

## Running the suite

```bash
cd frontend
npm run test          # one-shot run
npm run test:watch    # watch mode
```

32 tests across 4 files, all currently passing. No test hits a real
network — every test that would otherwise need one mocks `global.fetch`
with a small hand-rolled `vi.fn()` stub, not MSW, matching this variant's
overall "prefer the plain, hand-rolled version" spirit rather than reaching
for a heavier mocking library.

## What each file covers, and why it's shaped the way it is

### `src/context/reducers/taskReducer.test.ts` (16 tests)

`taskReducer` is a pure function — no React, no network, no mocking
needed at all. Covers:

- Fetch/pagination transitions (`FETCH_START`/`SUCCESS`/`ERROR`,
  `LOAD_MORE_START`/`SUCCESS`/`ERROR`).
- Every optimistic scenario, for all three mutation types
  (create/update-including-toggle/delete): the initial `_OPTIMISTIC`
  apply, `CONFIRM` reconciling with server truth, and `ROLLBACK`
  restoring the exact prior state — see
  [`OPTIMISTIC_UI.md`](OPTIMISTIC_UI.md) for what each of those is
  supposed to do and why.
- `RESET` (the logout-triggered reducer reset — see
  [`../AUTH.md`](../AUTH.md) Part 6).
- A guard case: dispatching `UPDATE_OPTIMISTIC`/`DELETE_OPTIMISTIC`/
  `CONFIRM`/`ROLLBACK` against an id that isn't in the list is a no-op,
  not a crash.

This is the most exhaustively tested file in the app on purpose — it's
also the piece of hand-rolled logic doing the most work that Apollo used
to do automatically in the original (see `DATA_LAYER.md`/`OPTIMISTIC_UI.md`),
so it's the highest-value place to have real regression coverage.

### `src/lib/apiClient.test.ts` (10 tests)

Mocks `global.fetch` directly. Covers:

- The JWT `Authorization` header is attached when a token is stored, and
  omitted when it isn't.
- A normal successful response resolves with `body.data`.
- **Both** ways a request can fail as unauthenticated get tested
  separately, because `graphqlRequest` genuinely checks both: an HTTP 401
  (rejected before GraphQL ever ran), and a resolver-level
  `UNAUTHENTICATED` GraphQL error arriving with HTTP 200 (GraphQL's
  errors-don't-use-status-codes convention — see
  [`../api/GRAPHQL.md`](../api/GRAPHQL.md)). Both assert the same thing:
  the token gets cleared and `AUTH_LOGOUT_EVENT` fires exactly once.
- A *non*-auth GraphQL error (`BAD_USER_INPUT`) rejects with the right
  message/code but does **not** trigger a logout — the negative case,
  proving the auth-specific branch doesn't fire indiscriminately for any
  error.
- A non-2xx, non-401 HTTP failure (500) rejects with a status-based
  message.
- `toError`'s three branches (an `Error` instance passed through as-is,
  an `ApiError`-shaped plain object unwrapped to its `.message`, anything
  else falling back to a caller-supplied message).

### `src/hooks/useDebounce.test.ts` (3 tests)

Fake timers (`vi.useFakeTimers()`), no real `setTimeout` waits. Covers:
the initial value is returned immediately; the debounced value doesn't
update until the full delay has elapsed (checked at both delay-minus-1ms
and exactly-delay); rapid successive changes each reset the timer, so
only the *final* value ever actually commits.

**Gotcha worth knowing if you extend this file:** `vi.advanceTimersByTime(...)`
has to be wrapped in Testing Library's `act(...)` here, or React's state
update from the resulting `setTimeout` firing won't have flushed yet by
the time the next assertion runs — the test will read a stale value and
fail, not because the hook is broken but because the test observed it too
early.

### `src/context/AuthContext.test.tsx` (3 tests)

The one genuine **regression test** in the suite, guarding a specific bug
fix rather than just describing current behavior. The original shipped
with a documented `⚠️ KNOWN GAP`: refreshing the page with a stored token
left session state stuck at `"loading"` forever, because nothing ever
called `Query.me` to resolve it. This variant fixed that structurally (see
[`../AUTH.md`](../AUTH.md) Part 6) — this file exists specifically so that
fix can't silently regress:

- Mounting with a stored **valid** token resolves `"loading"` →
  `"success"`, with the resolved user's email actually rendered.
- Mounting with a stored **stale** token (server returns `me: null`)
  resolves to `"idle"`, not stuck.
- Mounting with **no** stored token at all skips the network call
  entirely and starts (and stays) `"idle"` — asserted by checking
  `fetch` was never called, not just by checking the final state.

## What isn't covered, and why

- **No component/view snapshot or interaction tests** for `Dashboard.tsx`,
  `Login.tsx`, etc. — the logic worth testing (optimistic mutations,
  auth resolution, debouncing) lives in the reducer/hooks/context layer
  covered above; the views themselves are mostly composition and JSX.
- **No `ErrorBoundary.test.tsx`.** An error boundary was built once during
  this variant's own development, then deliberately removed at the user's
  request to keep this project free of class components (React's
  error-boundary API has no hook equivalent) — see the root
  [`../README.md`](../README.md)'s scope note. There's nothing to test
  because there's nothing there.
- **No end-to-end/browser tests.** Everything above runs in jsdom via
  Vitest; nothing drives a real browser. Manual verification against the
  actual running app (both dev servers up, real login/create/toggle/
  delete/filter/paginate flows) was done incrementally throughout this
  variant's build instead — see
  [`../../taskmanager/REBUILD_REACT_PROGRESS.md`](../../taskmanager/REBUILD_REACT_PROGRESS.md)
  for the chunk-by-chunk verification notes.

## Key files

| File | Role |
|---|---|
| `vite.config.ts` (`test` block) | Vitest config — `environment: "jsdom"`, `globals: true`, `setupFiles`. |
| `src/test/setup.ts` | Registers `@testing-library/jest-dom`'s matchers globally. |
| `src/context/reducers/taskReducer.test.ts` | Pure-function reducer tests. |
| `src/lib/apiClient.test.ts` | Mocked-`fetch` client tests. |
| `src/hooks/useDebounce.test.ts` | Fake-timer hook test. |
| `src/context/AuthContext.test.tsx` | The page-refresh regression test. |
