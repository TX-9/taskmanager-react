# State Sharing Patterns in React

Comparison of four approaches for managing and sharing state across components: `useState`/`useReducer` with prop drilling, `useReducer` + `useContext`, and Zustand.

---

## 1. `useReducer` Alone (Prop Drilling)

State lives in a parent component and is passed down explicitly via props.

```tsx
// Parent owns state
function TaskProvider() {
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);

  return <TaskList tasks={state.tasks} dispatch={dispatch} />;
}

// Middle layer must forward props even if it doesn't use them
function TaskList({ tasks, dispatch }: { tasks: Task[]; dispatch: Dispatch<TaskAction> }) {
  return (
    <ul>
      {tasks.map(task => (
        <TaskItem key={task.id} task={task} dispatch={dispatch} />
      ))}
    </ul>
  );
}

// Leaf consumer
function TaskItem({ task, dispatch }: { task: Task; dispatch: Dispatch<TaskAction> }) {
  return (
    <li>
      {task.title}
      <button onClick={() => dispatch({ type: "DELETE_TASK", payload: task.id })}>
        Delete
      </button>
    </li>
  );
}
```

**When to use:** 1–2 levels deep. State is local and doesn't need to escape the subtree.

**Drawback:** Every intermediate component must accept and forward props it doesn't use ("middleman" problem).

---

## 2. `useReducer` + `useContext`

`useReducer` owns the state logic; `useContext` broadcasts it so any descendant can subscribe directly — no prop threading.

```tsx
// context/TaskContext.tsx
import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";

interface TaskContextValue {
  state: TaskState;
  dispatch: Dispatch<TaskAction>;
}

const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  // useReducer owns state — useContext only distributes it
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);

  return (
    <TaskContext.Provider value={{ state, dispatch }}>
      {children}
    </TaskContext.Provider>
  );
}

export function useTaskContext(): TaskContextValue {
  const value = useContext(TaskContext);
  if (!value) throw new Error("useTaskContext must be used within TaskProvider");
  return value;
}
```

```tsx
// Any descendant — no props needed
function TaskItem({ task }: { task: Task }) {
  const { dispatch } = useTaskContext();

  return (
    <li>
      {task.title}
      <button onClick={() => dispatch({ type: "DELETE_TASK", payload: task.id })}>
        Delete
      </button>
    </li>
  );
}
```

**When to use:** State is consumed in many unrelated parts of the tree. This is the pattern used in this codebase (`TaskContext.tsx`).

**Drawback:** Every context consumer re-renders when **any** part of context value changes — even if only an unrelated field updated. Mitigate by splitting contexts or memoising selectors.

---

## 3. Component Composition

Pass fully-rendered JSX as props so intermediate components never touch the data. Avoids both prop drilling and context.

```tsx
function App() {
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);

  // Layout receives pre-rendered children — it never sees state or dispatch
  return (
    <Layout
      sidebar={<FilterPanel filter={state.filter} dispatch={dispatch} />}
      main={<TaskList tasks={state.tasks} dispatch={dispatch} />}
    />
  );
}

// Layout knows nothing about tasks
function Layout({ sidebar, main }: { sidebar: ReactNode; main: ReactNode }) {
  return (
    <div className="layout">
      <aside>{sidebar}</aside>
      <section>{main}</section>
    </div>
  );
}
```

**When to use:** You control the tree structure and can compose at the top level. Works well for layout components.

**Drawback:** Less flexible when children need to be dynamic or spawned deep inside a third-party component.

---

## 4. Zustand

A lightweight external store. Components subscribe directly; no Provider wrapping required.

```tsx
// store/taskStore.ts
import { create } from "zustand";

interface TaskStore {
  tasks: Task[];
  filter: string;
  addTask: (task: Task) => void;
  deleteTask: (id: string) => void;
  setFilter: (filter: string) => void;
}

export const useTaskStore = create<TaskStore>((set) => ({
  tasks: [],
  filter: "all",

  addTask: (task) =>
    set((state) => ({ tasks: [...state.tasks, task] })),

  deleteTask: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),

  setFilter: (filter) => set({ filter }),
}));
```

```tsx
// Any component — no Provider, no context
function TaskItem({ task }: { task: Task }) {
  // Only re-renders when deleteTask reference changes (it won't)
  const deleteTask = useTaskStore((state) => state.deleteTask);

  return (
    <li>
      {task.title}
      <button onClick={() => deleteTask(task.id)}>Delete</button>
    </li>
  );
}

function FilterPanel() {
  // Subscribes only to `filter` — won't re-render on task list changes
  const filter = useTaskStore((state) => state.filter);
  const setFilter = useTaskStore((state) => state.setFilter);

  return <select value={filter} onChange={(e) => setFilter(e.target.value)} />;
}
```

**When to use:** Large apps with many consumers, or when fine-grained re-render control matters. State can be accessed outside React (e.g., in utility functions or event handlers).

**Drawback:** External dependency; state lives outside React's tree, so React DevTools integration is weaker. Requires the Zustand library.

---

## Comparison

| | Prop Drilling | `useReducer` + `useContext` | Composition | Zustand |
|---|---|---|---|---|
| **Extra dependencies** | None | None | None | `zustand` |
| **Provider required** | No | Yes | No | No |
| **Prop threading** | Yes | No | No | No |
| **Re-render scope** | Only passed consumers | All context consumers | Only passed consumers | Only subscribed selectors |
| **Access outside React** | No | No | No | Yes |
| **Best for** | Shallow trees | App-wide shared state | Layout composition | Large apps, perf-sensitive |

### Rule of thumb

- **1–2 levels deep** → prop drilling is fine, no overhead.
- **App-wide state, moderate scale** → `useReducer` + `useContext` (this codebase's choice).
- **Layout wiring** → component composition eliminates middlemen cleanly.
- **Many subscribers, perf-critical, or state needed outside React** → Zustand.
