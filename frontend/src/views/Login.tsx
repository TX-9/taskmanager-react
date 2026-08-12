// Pattern: controlled form inputs (Component patterns section) — every input
// value is driven by state and updated via onChange, never read from the DOM.

import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function Login(): JSX.Element {
  // This component never touches the network directly. `login` (from
  // useAuth(), frontend/src/hooks/useAuth.ts) forwards to AuthContext's
  // `login`, which is where the actual apiClient.graphqlRequest call lives —
  // see frontend/src/context/AuthContext.tsx for the LOGIN_MUTATION call and
  // what happens to its response. `state` below is that same context's
  // AsyncState<User>, reused here just to disable the submit button while
  // the mutation is in flight.
  const { login, state } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@taskmanager.dev");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);
      try {
        await login(email, password);
        // Reached only on success — AuthContext's login() re-throws on failure,
        // so any network or credential error jumps to the catch below instead.
        navigate("/", { replace: true });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Login failed.");
      }
    },
    [email, password, login, navigate],
  );

  const isSubmitting = state.status === "loading";

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-bold text-gray-900">Sign in to TaskManager</h1>

        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          Don't have an account?{" "}
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Login;
