# Optimistic UI, done by hand: `runOptimistic`, snapshot rollback, temp-id reconciliation

No direct equivalent in the original — this documents the genuinely new
mechanics of `useTaskMutations.ts` + `taskReducer.ts`, and contrasts each
piece directly against what Apollo's `optimisticResponse` did automatically
(see
[`../../taskmanager/frontend/DASHBOARD.md`](../../taskmanager/frontend/DASHBOARD.md)'s
Part 1 "Optimistic UI, concretely" and Part 3 traces B/C/D if you want the
original's own explanation alongside this one).

## The shape: `apply → confirm/rollback`

```ts
// frontend/src/hooks/useTaskMutations.ts
async function runOptimistic<TResult>({ apply, request, confirm, rollback }: RunOptimisticParams<TResult>): Promise<void> {
  apply();
  try {
    const result = await request();
    confirm(result);
  } catch (error) {
    rollback();
    throw toError(error, "Mutation failed.");
  }
}
```

Every mutation (`createTask`/`updateTask`/`toggleStatus`/`deleteTask`) is
this same three-step shape with different arguments: `apply` dispatches an
optimistic action into `taskReducer` *synchronously*, before `request`
(the real `graphqlRequest` call) has even started; if `request` resolves,
`confirm` reconciles the optimistic guess with the server's real data; if
it rejects, `rollback` undoes exactly what `apply` did. This is the same
three moments Apollo's `optimisticResponse` + automatic-rollback covered —
just each one is an explicit function call here instead of a mutation
option Apollo interpreted internally.

## Where the "undo" information actually lives

The key design decision is that **`taskReducer` — not the caller — knows
how to undo each operation**. When an optimistic action is applied, the
reducer itself records a snapshot keyed by task id in `pendingOperations`:

```ts
// frontend/src/context/reducers/taskReducer.ts
case "CREATE_OPTIMISTIC":
  return { ...state, tasks: [action.task, ...state.tasks], totalCount: state.totalCount + 1,
    pendingOperations: { ...state.pendingOperations, [action.task.id]: { type: "create" } } };

case "UPDATE_OPTIMISTIC": {
  const existing = state.tasks.find((task) => task.id === action.id);
  // ...
  pendingOperations: { ...state.pendingOperations, [action.id]: { type: "update", snapshot: existing } }
}

case "DELETE_OPTIMISTIC": {
  const index = state.tasks.findIndex((task) => task.id === action.id);
  const snapshot = state.tasks[index];
  // ...
  pendingOperations: { ...state.pendingOperations, [action.id]: { type: "delete", snapshot, index } }
}
```

- **Create** has nothing to snapshot — there's no "before" for a task that
  didn't exist — so it just marks `{ type: "create" }`, a bare marker.
- **Update** (used by both a generic `updateTask` and the `toggleStatus`
  one-click case) snapshots the *entire prior task object*, not just the
  changed field, so rollback can restore it exactly regardless of what
  changed.
- **Delete** snapshots both the task *and its exact array index*, so a
  failed delete doesn't just reinsert the task somewhere — it reappears
  exactly where it was.

`CONFIRM`/`ROLLBACK` then just take an `id` (plus, for confirm, the
server's real task where relevant) and look up `pendingOperations[id]` to
decide what to do — the caller (`useTaskMutations`) never has to pass or
remember a snapshot itself; it only has to remember *which id* it started
an operation on.

## Direct contrast: what Apollo did automatically vs. what's explicit here

| Apollo (original) | This variant |
|---|---|
| `optimisticResponse` — Apollo writes a fake result into the normalized cache synchronously, before the network call. | `apply()` dispatches `CREATE_OPTIMISTIC`/`UPDATE_OPTIMISTIC`/`DELETE_OPTIMISTIC` — `taskReducer` produces new state synchronously, before `request()` starts. |
| Automatic rollback on mutation rejection — "you do not write any rollback code yourself" (`DASHBOARD.md`). | `rollback()` dispatches `ROLLBACK`, which looks up the snapshot `apply()`'s reducer case already recorded and restores it explicitly. |
| `update` callback needed for **list** changes specifically, since normalized entities update in place automatically but arrays of references don't grow/shrink on their own. | `CREATE_OPTIMISTIC`/`DELETE_OPTIMISTIC` themselves splice the array — there's no separate "escape hatch" step, because there's no automatic-field-update path to be an exception to in the first place. Every change, field or list-shaped, goes through the same reducer dispatch. |
| Temp-id reconciliation needed **two passes** through the same `update` callback — one for the optimistic `temp-xxx` id, one for the real server id — because a new cache entry appears under the temp id and has to be swapped out entirely for a differently-keyed real entity. | `CONFIRM` does this in **one** step: `state.tasks.map(t => t.id === action.id ? confirmedTask : t)` finds the entry still keyed by the *original* id passed to `CONFIRM` (the temp id, kept in the caller's closure) and replaces the whole object — including its id — in place. |
| Documented in `DASHBOARD.md`: the original's create flow has a **known bug** where `totalCount` increments on both the optimistic *and* the real-response pass, ending up transiently one too high. | Doesn't reproduce that bug: `CREATE_OPTIMISTIC` increments `totalCount` exactly once, and `CONFIRM` doesn't touch `totalCount` at all — there's only one increment in the whole flow because there's only one action that means "a new task was added," not two passes through the same callback that each had an opportunity to increment. |
| `cache.evict()` + `cache.gc()` for delete — the array reference to the deleted entity is *never removed*; Apollo's read path filters out dangling references automatically, so on rollback (un-evict), the task reappears in its original position for free. | `DELETE_OPTIMISTIC` removes the task from the array outright (`state.tasks.filter(...)`) and snapshots its index; `ROLLBACK` re-`splice`s it back in at that exact index. Different mechanism, same outcome — Apollo never removes the pointer in the first place, this variant removes-and-reinserts by recorded position. |

## Temp-id reconciliation, traced

1. `createTask(title)` generates `` `temp-${crypto.randomUUID()}` `` and
   builds a full optimistic `Task` under that id.
2. `apply()` → `dispatch({ type: "CREATE_OPTIMISTIC", task: optimisticTask })`
   — the temp task is now at the front of `state.tasks`, and
   `pendingOperations["temp-xxx"] = { type: "create" }`.
3. `request()` → `graphqlRequest(CREATE_TASK_MUTATION, { input: { title } })`
   resolves with the server's real task, under a real UUID.
4. `confirm(result)` → `dispatch({ type: "CONFIRM", id: "temp-xxx", task: result.createTask })`.
   Note the `id` passed is still the **temp** id — that's the key the
   reducer needs to find the placeholder entry in the array. The `task`
   being confirmed carries the **real** id. `taskReducer`'s `CONFIRM` case
   replaces the array element whose `id === "temp-xxx"` with the whole
   `result.createTask` object — the entry's id silently changes from temp
   to real as part of that replacement, in the same array position it was
   already prepended into.
5. If step 3 had rejected instead, `rollback()` → `dispatch({ type:
   "ROLLBACK", id: "temp-xxx" })` — `taskReducer` finds
   `pendingOperations["temp-xxx"].type === "create"` and filters that
   entry out of the array entirely (there's nothing to restore *to*, a
   create has no prior state).

## Why `AUTH_LOGOUT_EVENT` resets `TaskContext`, not `useTaskMutations`

One more piece worth calling out: the `RESET` action (returns
`initialTaskState`) is dispatched from a listener inside `TaskContext.tsx`
itself, not from `useTaskMutations`. This mirrors what
`apolloClient.clearStore()` did in the original on logout — wipe
server-derived state so the next user on the same tab never sees a flash
of the previous session's tasks — but the listener lives on the Provider
specifically so the reset fires exactly once regardless of which
views/hooks happen to be mounted at logout time, rather than depending on
`useTaskMutations` (a hook, only alive while some component using it is
mounted) to have been rendered recently enough to catch the event.
