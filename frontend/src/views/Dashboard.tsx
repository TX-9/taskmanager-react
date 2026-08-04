// Real task list, fetched via useTasks and mutated via useTaskMutations.
// TaskCard + virtualized List for presentation (Chunk 20) — no filters yet
// (Chunk 21).

import { memo, useCallback, useState, type FormEvent } from "react";
import TaskCard from "../components/TaskCard";
import List from "../components/List";
import { useAuth } from "../hooks/useAuth";
import { useTasks } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import type { Task } from "../types/task";

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
    <TaskCard task={task}>
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
  const { state } = useTasks();
  const { createTask, toggleStatus, deleteTask } = useTaskMutations();

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const title = newTaskTitle.trim();
      if (!title) {
        return;
      }
      setNewTaskTitle("");
      setFormError(null);
      try {
        await createTask(title);
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Failed to create task.");
      }
    },
    [newTaskTitle, createTask],
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

      <form onSubmit={(event) => void handleCreate(event)} className="mb-6 flex gap-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          placeholder="What needs doing?"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
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
          items={state.data.tasks}
          keyExtractor={(task) => task.id}
          emptyState="No tasks yet — add one above."
          renderItem={(task) => <TaskListItem task={task} onToggle={handleToggle} onDelete={handleDelete} />}
        />
      )}
    </div>
  );
}

export default Dashboard;
