# Use cases

What this app is actually for, and which feature maps to which part of the
codebase. Written as user stories so it's clear *why* a given pattern was
used, not just that it was used — pair this with the root
[`README.md`](README.md)'s "Patterns demonstrated" table, which maps
technique → file without the "why." Same feature set as the original
[`taskmanager`](../taskmanager), minus real-time sync (dropped entirely —
see non-goals) and with a couple of honest gaps noted where this build
didn't carry over everything the original had.

## Core use cases

### 1. Sign up and log in

> As a new user, I want to create an account with an email and password, and
> log back in later, so my tasks are private to me and persist across
> sessions.

- `register` / `login` mutations (`api/src/schema/resolvers/auth.ts`,
  unchanged from the original) — the latter verifies a bcrypt hash and
  issues a JWT; the former hashes and stores a new one. Both are reachable
  from the UI — `frontend/src/views/Register.tsx` and
  `frontend/src/views/Login.tsx`, cross-linked to each other.
- The JWT is stored client-side (`frontend/src/lib/authToken.ts` —
  `setAuthToken`/`getAuthToken`, `localStorage`) and attached to every
  request by `frontend/src/lib/apiClient.ts`'s `graphqlRequest` — a plain
  function each call site calls directly, rather than an Apollo Link
  running implicitly in the background.
- `frontend/src/context/AuthContext.tsx` + `frontend/src/hooks/useAuth.ts`
  expose `{ user, isAuthenticated, login, register, logout }` to the rest
  of the app — same public shape as the original.
- Losing/expiring the token is handled uniformly: any resolver can throw
  `UNAUTHENTICATED` (`api/src/utils/errors.ts`), and `graphqlRequest`
  reacts to that code (or a bare HTTP 401) by clearing the token and
  dispatching `AUTH_LOGOUT_EVENT` — one function doing what the original
  split across `authLink`/`errorLink`.

### 2. Capture a task quickly

> As a logged-in user, I want to type a task title and have it appear in my
> list immediately, without waiting for a network round trip.

- `useTaskMutations().createTask` (`frontend/src/hooks/useTaskMutations.ts`)
  generates a temporary client-side id, dispatches `CREATE_OPTIMISTIC`
  (`frontend/src/context/reducers/taskReducer.ts`) so the task appears in
  the list instantly, then either swaps the temp id for the server's real
  task (`CONFIRM`) or removes it entirely (`ROLLBACK`) once the real
  request settles.
- Unlike the original, the new-task input does **not** auto-focus on
  mount — that `useRef`/`useEffect` behavior was never carried over into
  this build's `Dashboard.tsx`. A real, minor gap, not a design choice.

### 3. Track a task through its lifecycle

> As a user, I want to mark a task in-progress or done, and change my mind
> without friction, without a page reload or a spinner every time.

- `status` is one of `TODO` / `IN_PROGRESS` / `DONE`
  (`api/prisma/schema.prisma`, identical to the original). The
  `toggleStatus` mutation flips between `TODO` and `DONE` for the common
  one-click case.
- `TaskCard.Actions` (`frontend/src/components/TaskCard/Actions.tsx`)
  exposes the toggle; `useTaskMutations().toggleStatus` applies it
  optimistically via `UPDATE_OPTIMISTIC`/`CONFIRM`/`ROLLBACK`, so the
  checkbox feels instantaneous the same way it did with Apollo's
  `optimisticResponse`.
- `TaskCard.Badge` (`frontend/src/components/TaskCard/Badge.tsx`) renders
  the current status (and priority) as a colored pill, typed so a status
  value can never accidentally render with priority styling or vice versa.

### 4. Find a specific task in a long list

> As a user with 100+ tasks, I want to filter by status/priority and search
> by title, and have those filters remain set if I navigate away and come
> back.

- Status filter, priority filter, and priority sort live in
  `frontend/src/store/filterStore.ts` — a Zustand store, deliberately
  **not** component state or `TaskContext` state, specifically so
  switching from Dashboard to Analytics and back doesn't reset them.
- The search box is debounced (`frontend/src/hooks/useDebounce.ts`) so
  typing doesn't fire a separate GraphQL request per keystroke.
- The `tasks` query accepts `filter: TaskFilterInput` (status, priority,
  search) and does the actual filtering in Postgres via Prisma
  (`api/src/schema/resolvers/tasks.ts`, unchanged) — not client-side.
  Priority *sort*, unlike status/priority filtering, has no server-side
  field to request — it's applied client-side in `Dashboard.tsx`'s
  `sortByPriority`, same as the original did.

### 5. Scroll through a large task list without it getting janky

> As a user with hundreds of tasks, I want the list to stay smooth, and to
> be able to load more without the page getting slower over time.

- `tasks` is paginated (`page`/`limit`/`hasNextPage`), fetched
  incrementally via `useTasks`' hand-rolled `loadMore`
  (`frontend/src/hooks/useTasks.ts`, dispatching
  `LOAD_MORE_START`/`LOAD_MORE_SUCCESS` into `taskReducer`) rather than
  Apollo's `fetchMore`.
- Once the *rendered* list exceeds 100 items, `List<T>`
  (`frontend/src/components/List/index.tsx`, copied verbatim) switches to
  virtualized rendering (`@tanstack/react-virtual`) — only the rows
  actually visible in the viewport are mounted to the DOM.
- `TaskCard` is wrapped in `React.memo`, via the `TaskListItem` boundary in
  `Dashboard.tsx`, so toggling or deleting one task doesn't re-render every
  other row on screen.

### 6. See progress at a glance

> As a user, I want to know how the tasks I have are distributed across
> status and priority without counting manually.

- `frontend/src/views/Analytics.tsx` (lazy-loaded — see use case 7) fetches
  up to 100 tasks via `useAsyncFetch` + `graphqlRequest`, independent of
  `TaskContext`, and breaks the list down by status and by priority as two
  separate bar-chart cards via `useMemo`.
- **Gap, not a design choice:** the original's Dashboard additionally
  showed a `{ total, completed, completionPercentage }` progress bar in
  its header and updated the browser tab title (`document.title`) with the
  remaining-task count. Neither made it into this build's `Dashboard.tsx`
  — Analytics is the only "progress at a glance" surface here.

### 7. Get analytics and manage preferences without slowing down the main app

> As a user, I mostly just want my task list to load fast — I only visit
> Analytics or Settings occasionally.

- Both views are behind `React.lazy()` (`frontend/src/App.tsx`), so their
  code is a separate bundle chunk fetched only on navigation — confirmed
  via `npm run build`'s output (`Settings-*.js`/`Analytics-*.js` as
  genuinely separate, small chunks).
- Settings additionally demonstrates guarding a route with the `withAuth`
  HOC (`frontend/src/hoc/withAuth.tsx`) instead of the `<ProtectedRoute>`
  wrapper used elsewhere (`frontend/src/components/Layout/ProtectedRoute.tsx`)
  — both patterns exist side by side deliberately, same as the original.

## Non-goals (explicitly out of scope for this variant)

- **Real-time sync across tabs/devices.** The original's `taskUpdated`
  GraphQL subscription over WebSocket doesn't exist here at all — this is
  this variant's entire premise (see root README), not an oversight.
- **Team/shared task boards.** Same as the original — the data model is
  single-owner.
- **Offline support / local-first sync.** Optimistic updates make single
  mutations feel instant, but there's no offline queue — if the network is
  down when a mutation is sent, it fails and rolls back rather than
  retrying later.
- **Password reset / email verification.** `register`/`login` exist; the
  account-recovery flows around them don't.
- **Task assignment / due dates / comments / attachments.** The schema
  (`api/prisma/schema.prisma`, identical to the original) is intentionally
  minimal.
- **Dashboard completion-progress bar / document-title updates.** Present
  in the original, not carried over here — see use case 6.
- **New-task input auto-focus.** Present in the original, not carried over
  here — see use case 2.
- **A React error boundary.** Built once during this variant's own build
  (it fills a real gap the original never addressed), then deliberately
  removed at the user's request to keep this project free of class
  components, since React's error-boundary API has no hook equivalent.
