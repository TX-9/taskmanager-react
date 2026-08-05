// Pattern: withAuth HOC. The app actually guards most routes with <ProtectedRoute>
// since it composes more naturally with react-router-dom's route elements,
// but this HOC is kept as a demonstration of the pattern and is a drop-in
// alternative: `export default withAuth(SettingsPage)`.

import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// Step 1 — accept any component whose props are P, return a new component with the same prop shape.
// Callers see no difference: `<SettingsPage />` works the same whether Settings is wrapped or not.
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
): React.ComponentType<P> {
  // Step 2 — define the wrapper. React will call this whenever the exported component renders.
  function WithAuth(props: P): JSX.Element {
    // Step 3 — read auth state from context (no fetch; AuthContext's `me` query owns that).
    const { isAuthenticated, state } = useAuth();

    // Step 4 — while AuthContext is resolving the session, block rendering to avoid a flash of the
    // protected page or a premature redirect.
    if (state.status === "loading") {
      return <div className="flex h-screen items-center justify-center text-sm text-gray-400">Loading…</div>;
    }

    // Step 5 — if the session resolved and there is no authenticated user, redirect to login.
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }

    // Step 6 — auth confirmed: render the original component, forwarding all props unchanged.
    return <WrappedComponent {...props} />;
  }

  // Step 7 — label the wrapper so React DevTools shows `withAuth(Settings)` instead of `WithAuth`.
  WithAuth.displayName = `withAuth(${WrappedComponent.displayName ?? WrappedComponent.name ?? "Component"})`;

  // Step 8 — return the wrapper as the new component. `export default withAuth(Settings)` in
  // Settings.tsx replaces the export with this wrapper, so the router never sees the raw component.
  return WithAuth;
}
