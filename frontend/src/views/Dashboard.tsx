// Real task list, fetched via useTasks (Chunk 18). Deliberately plain for
// now — a bare <ul><li>, no TaskCard styling (Chunk 20), no filters (Chunk
// 21), no optimistic create/toggle/delete (Chunk 19) yet.

import { useAuth } from "../hooks/useAuth";
import { useTasks } from "../hooks/useTasks";

function Dashboard(): JSX.Element {
  const { user, logout } = useAuth();
  const { state } = useTasks();

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

      {state.status === "loading" && <p className="text-sm text-gray-400">Loading tasks…</p>}
      {state.status === "error" && (
        <p className="text-sm text-red-600">Failed to load tasks: {state.error.message}</p>
      )}

      {state.status === "success" && (
        <ul className="space-y-2">
          {state.data.tasks.map((task) => (
            <li key={task.id} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm">
              {task.title} — {task.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default Dashboard;
