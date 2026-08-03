// Pattern: controlled form inputs (Component patterns section) — every input
// value is driven by state and updated via onChange, never read from the DOM.
// See ../../AUTH.md for the full register flow this form triggers (hash the
// password, create the User row, sign a JWT — registering also logs you in,
// no separate login step needed).

import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const MIN_PASSWORD_LENGTH = 8;

function Register(): JSX.Element {
  // Same indirection as Login.tsx: `register` (from useAuth(),
  // frontend/src/hooks/useAuth.ts) forwards to AuthContext's `register`,
  // which is where the actual apiClient.graphqlRequest call lives — see
  // frontend/src/context/AuthContext.tsx.
  const { register, state } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setFormError(null);

      if (password.length < MIN_PASSWORD_LENGTH) {
        setFormError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
        return;
      }
      if (password !== confirmPassword) {
        setFormError("Passwords do not match.");
        return;
      }

      try {
        await register(email, password);
        // `replace` so back button skips this page — user is now logged in.
        navigate("/", { replace: true });
      } catch (error) {
        setFormError(error instanceof Error ? error.message : "Registration failed.");
      }
    },
    [email, password, confirmPassword, register, navigate],
  );

  const isSubmitting = state.status === "loading";

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-6 text-xl font-bold text-gray-900">Create your TaskManager account</h1>

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
          minLength={MIN_PASSWORD_LENGTH}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="confirmPassword">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />

        {formError && <p className="mb-4 text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}

export default Register;
