// Pattern: <ProtectedRoute> component (Component patterns section) — the
// preferred way to guard routes in this app, used directly in App.tsx's
// route tree.

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
}

function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  // No direct network call here — `isAuthenticated`/`state` come from
  // useAuth() (frontend/src/hooks/useAuth.ts), which just reads
  // AuthContext's state. The actual login/`me`-resolution logic that
  // produces this state lives in frontend/src/context/AuthContext.tsx.
  const { isAuthenticated, state } = useAuth();
  const location = useLocation();

  // Genuinely transient here, not stuck: AuthContext's `me` query (Chunk 15)
  // resolves this out of "loading" on mount when a stored token exists —
  // to either "success" or "idle" — so this screen renders briefly, not
  // indefinitely.
  if (state.status === "loading") {
    return <div className="flex h-screen items-center justify-center text-sm text-gray-400">Loading…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
