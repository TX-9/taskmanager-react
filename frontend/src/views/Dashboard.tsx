// Real task list, fetched via useTasks and mutated via useTaskMutations
import { useCallback, useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTasks } from "../hooks/useTasks";
import { useTaskMutations } from "../hooks/useTaskMutations";
import type { Task } from "../types/task";

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

      <form onSubmit={(event) => void handleCreate(event)} className="mb-4 flex gap-2">
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
        <ul className="space-y-2">
          {state.data.tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-4 py-2 text-sm"
            >
              <span>
                {task.title} — {task.status}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggle(task)}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                >
                  Toggle
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(task)}
                  className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Dashboard;
