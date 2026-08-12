// Real task list, fetched via useTasks and mutated via useTaskMutations.
// TaskCard + virtualized List for presentation. 
// Filters/search via filterStore — pure client-only UI state (Zustand), kept
// deliberately separate from TaskContext's server-derived data.

import { memo, useCallback, useMemo, useState, type FormEvent } from "react";
import TaskCard from "../components/TaskCard";
import List from "../components/List";
import { useAuth } from "../hooks/useAuth";
import { useTasks } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import { useDebounce } from "../hooks/useDebounce";
import { useFilterStore, type PrioritySort } from "../store/filterStore";
import type { Task, TaskFilter, TaskPriority, TaskStatus } from "../types/task";

function sortByPriority(tasks: Task[], direction: "HIGH_FIRST" | "LOW_FIRST"): Task[] {
  const weight: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const sorted = [...tasks].sort((a, b) => weight[a.priority] - weight[b.priority]);
  return direction === "HIGH_FIRST" ? sorted.reverse() : sorted;
}

interface TaskListItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
}

// This wrapper exists specifically to make React.memo on <TaskCard> (see
// components/TaskCard/index.tsx) actually work. `List`'s `renderItem` is
// called fresh, once per task, on every render of the list — if it built the
// compound `<TaskCard>...</TaskCard>` JSX directly, the `children` prop
// TaskCard receives would be a brand-new object every single call, which
// fails React.memo's shallow prop comparison regardless of whether `task`
// itself changed. Moving the memo boundary here instead means
// `onToggle`/`onDelete` are the raw, stable `useCallback` references from
// Dashboard (not pre-bound per-task closures — binding happens inside this
// component's own render instead, so it doesn't count against the memo
// comparison), so React.memo's shallow comparison correctly bails out for
// every row except the one that actually changed.
const TaskListItem = memo(function TaskListItem({ task, onToggle, onDelete }: TaskListItemProps): JSX.Element {
  return (
    <TaskCard>
      <TaskCard.Header task={task} />
      <div className="flex items-center gap-3">
        <TaskCard.Badge kind="priority" value={task.priority} />
        <TaskCard.Badge kind="status" value={task.status} />
        <TaskCard.Actions onToggle={() => onToggle(task)} onDelete={() => onDelete(task)} />
      </div>
    </TaskCard>
  );
});

function Dashboard(): JSX.Element {
  const { user, logout } = useAuth();
  const { statusFilter, priorityFilter, prioritySort, searchQuery, setSearchQuery } = useFilterStore();

  const debouncedSearch = useDebounce(searchQuery, 300);

  const filter: TaskFilter = useMemo(
    () => ({
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      ...(priorityFilter !== "ALL" ? { priority: priorityFilter } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [statusFilter, priorityFilter, debouncedSearch],
  );

  const { state } = useTasks(filter);
  const { createTask, toggleStatus, deleteTask } = useTaskMutations();

  // prioritySort has no TaskFilterInput equivalent on the server (see api/src/schema/typeDefs.ts) — it's applied client-side
  const sortedTasks = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }
    return prioritySort === "NONE" ? state.data.tasks : sortByPriority(state.data.tasks, prioritySort);
  }, [state, prioritySort]);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("MEDIUM");
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = newTaskTitle.trim();
      if (!title) {
        return;
      }
      const priority = newPriority;
      setNewTaskTitle("");
      setNewPriority("MEDIUM");
      setFormError(null);
      try {
        await createTask(title, priority);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Failed to create task.");
      }
    },
    [newTaskTitle, newPriority, createTask],
  );

  const handleToggle = useCallback(
    async (task: Task) => {
      try {
        await toggleStatus(task);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Failed to update task.");
      }
    },
    [toggleStatus],
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      try {
        await deleteTask(task);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Failed to delete task.");
      }
    },
    [deleteTask],
  );

  return (
    <div className="mx-auto max-w-2xl p-8">
      <header className="mb-6 flex items-center justify-between">
        <p className="text-lg text-gray-900">Welcome, {user?.email}</p>
        <button
          type="button"
          onClick={logout}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Log out
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search tasks…"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <FilterControls />
      </div>

      <form onSubmit={(event) => void handleCreate(event)} className="mb-6 flex gap-2">
        <div className="flex flex-1 overflow-hidden rounded-md border border-gray-300 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
          <select
            value={newPriority}
            onChange={(event) => setNewPriority(event.target.value as TaskPriority)}
            aria-label="Task priority"
            className="border-r border-gray-300 bg-gray-50 px-2 py-2 text-sm focus:outline-none"
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
          <input
            type="text"
            value={newTaskTitle}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            placeholder="What needs doing?"
            className="flex-1 px-3 py-2 text-sm focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Add task
        </button>
      </form>

      {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}

      {state.status === "loading" && <p className="text-sm text-gray-400">Loading tasks…</p>}
      {state.status === "error" && (
        <p className="text-sm text-red-600">Failed to load tasks: {state.error.message}</p>
      )}

      {state.status === "success" && (
        <List
          items={sortedTasks}
          keyExtractor={(task) => task.id}
          emptyState="No tasks yet — add one above."
          renderItem={(task) => <TaskListItem task={task} onToggle={handleToggle} onDelete={handleDelete} />}
        />
      )}
    </div>
  );
}

function FilterControls(): JSX.Element {
  const { statusFilter, priorityFilter, prioritySort, setStatusFilter, setPriorityFilter, setPrioritySort } =
    useFilterStore();

  return (
    <div className="flex items-center gap-2">
      <select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "ALL")}
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="ALL">All statuses</option>
        <option value="TODO">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="DONE">Done</option>
      </select>
      <select
        value={priorityFilter}
        onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "ALL")}
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="ALL">All priorities</option>
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>
      <select
        value={prioritySort}
        onChange={(event) => setPrioritySort(event.target.value as PrioritySort)}
        className="rounded-md border border-gray-300 px-2 py-2 text-sm"
      >
        <option value="NONE">Unsorted</option>
        <option value="HIGH_FIRST">Priority: high first</option>
        <option value="LOW_FIRST">Priority: low first</option>
      </select>
    </div>
  );
}

export default Dashboard;
