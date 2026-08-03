// Placeholder — replaced with the real task list in Chunk 18 onward. Just
// enough to prove the login flow renders something real behind ProtectedRoute.

import { useAuth } from "../hooks/useAuth";

function Dashboard(): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-gray-50">
      <p className="text-lg text-gray-900">Welcome, {user?.email}</p>
      <button
        type="button"
        onClick={logout}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Log out
      </button>
    </div>
  );
}

export default Dashboard;
