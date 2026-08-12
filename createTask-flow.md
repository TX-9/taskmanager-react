# `createTask` Flow: State Changes & Re-renders

## Entry Point

**[Dashboard.tsx:69](taskmanager-react/frontend/src/views/Dashboard.tsx#L69)**

```ts
const { createTask } = useTaskMutations();
```

User submits the form → `handleCreate` fires → clears local state → calls `await createTask(title)`.

```
setNewTaskTitle("")   // local state → input re-renders empty
setFormError(null)    // local state → error message hidden
await createTask(title)
```

---

## Phase 1 — Optimistic Update (synchronous)

**[useTaskMutations.ts:58-86](taskmanager-react/frontend/src/hooks/useTaskMutations.ts#L58-L86)**

`createTask` immediately calls `runOptimistic()`, which calls `apply()` before awaiting the network:

```
dispatch({ type: "CREATE_OPTIMISTIC", task: optimisticTask })
```

**[taskReducer.ts](taskmanager-react/frontend/src/context/reducers/taskReducer.ts)** processes this:

| Field | Change |
|---|---|
| `state.tasks[]` | New task **prepended** at index 0 (temp ID: `temp-{UUID}`) |
| `state.totalCount` | +1 |
| `state.pendingOperations` | `{ [optimisticId]: { type: "create" } }` added |

### Re-renders triggered

```
taskReducer returns new TaskState
  └── TaskContext.Provider value changes (new object reference)
        └── useTasks() consumers re-render
              └── Dashboard re-renders
                    ├── sortedTasks useMemo recalculates (new task in list)
                    └── <List items={sortedTasks} />
                          └── new <TaskListItem key={optimisticId} task={newTask} /> mounts
                                └── React.memo: new props → <TaskCard> renders
                                      ├── TaskCard.Header   (title)
                                      ├── TaskCard.Badge    (status: "TODO")
                                      ├── TaskCard.Badge    (priority: "MEDIUM")
                                      └── TaskCard.Actions  (toggle / delete)
```

**Existing `TaskListItem`s do NOT re-render** — `React.memo` bails out because their `task` references are unchanged.

---

## Phase 2 — Network Request (async)

**[apiClient.ts](taskmanager-react/frontend/src/lib/apiClient.ts)** sends:

```
POST VITE_GRAPHQL_HTTP_URL
Authorization: Bearer <JWT from localStorage>
Body: { query: CreateTask, variables: { input: { title } } }
```

No state changes occur during this phase. The UI already shows the task.

---

## Phase 3a — Confirm (server success)

```
dispatch({ type: "CONFIRM", id: optimisticId, task: realTask })
```

**taskReducer** swaps the temp task for the server's response at the same list index:

| Field | Change |
|---|---|
| `state.tasks[]` | Task at index 0: temp ID → real UUID, server timestamps applied |
| `state.pendingOperations` | Entry for `optimisticId` removed |

### Re-renders triggered

```
taskReducer returns new TaskState
  └── useTasks() → Dashboard re-renders
        └── TaskListItem key changes (temp-UUID → real-UUID)
              └── React.memo: task reference changed → TaskCard re-renders with real data
```

---

## Phase 3b — Rollback (server failure)

```
dispatch({ type: "ROLLBACK", id: optimisticId })
```

**taskReducer** removes the optimistic task:

| Field | Change |
|---|---|
| `state.tasks[]` | Optimistic task removed |
| `state.totalCount` | -1 |
| `state.pendingOperations` | Entry removed |

Error re-throws → caught in `handleCreate` → `setFormError(message)`

### Re-renders triggered

```
taskReducer returns new TaskState
  └── useTasks() → Dashboard re-renders
        └── List re-renders without that task
              └── TaskListItem for that task unmounts

setFormError(message)
  └── Dashboard re-renders
        └── <p>{formError}</p> becomes visible
```

---

## Full State Map

```
User submits form
│
├─ [local]   newTaskTitle → ""
├─ [local]   formError → null
│
├─ [context] CREATE_OPTIMISTIC dispatch
│            tasks[0] = { id: "temp-UUID", title, status: "TODO", priority: "MEDIUM" }
│            totalCount + 1
│            pendingOperations["temp-UUID"] = { type: "create" }
│
│            → Dashboard → List → new TaskCard mounts (UI instantly updated)
│
├─ [async]   POST /graphql  (no state change, no re-render)
│
└─ [context] CONFIRM  ──or──  ROLLBACK
             confirm: swap temp task for real task in place
                      pendingOperations["temp-UUID"] removed
                      → Dashboard → TaskCard re-renders with real ID + timestamps

             rollback: tasks[0] removed
                       totalCount - 1
                       pendingOperations["temp-UUID"] removed
                       → Dashboard → TaskCard unmounts
                       + setFormError → error message renders
```

---

## Component Re-render Summary

| Component | Re-renders? | Why |
|---|---|---|
| Dashboard | Yes (×2–3) | `useTasks` state changes; local state changes |
| List | Yes | `items` array reference changes |
| New TaskListItem | Yes (mount) | New task, React.memo: no prior reference to compare |
| Existing TaskListItems | **No** | `React.memo` — `task` references unchanged |
| FilterControls | **No** | Zustand `useFilterStore` — task mutations don't touch filter state |

---

## Key Files

| File | Role |
|---|---|
| [Dashboard.tsx](taskmanager-react/frontend/src/views/Dashboard.tsx) | Form, `handleCreate`, `sortedTasks` memo, list rendering |
| [useTaskMutations.ts](taskmanager-react/frontend/src/hooks/useTaskMutations.ts) | `createTask`, `runOptimistic` pattern |
| [taskReducer.ts](taskmanager-react/frontend/src/context/reducers/taskReducer.ts) | `CREATE_OPTIMISTIC` / `CONFIRM` / `ROLLBACK` handlers |
| [TaskContext.tsx](taskmanager-react/frontend/src/context/TaskContext.tsx) | `useReducer` + Provider |
| [useTasks.ts](taskmanager-react/frontend/src/hooks/useTasks.ts) | Reshapes `TaskState` → `AsyncState<TaskPage>` for consumers |
| [apiClient.ts](taskmanager-react/frontend/src/lib/apiClient.ts) | GraphQL transport, JWT attachment, 401 → logout |
| [mutations.ts](taskmanager-react/frontend/src/graphql/mutations.ts) | `CREATE_TASK_MUTATION` document |
| [TaskCard/index.tsx](taskmanager-react/frontend/src/components/TaskCard/index.tsx) | Pure presentational, wrapped in `React.memo` |
