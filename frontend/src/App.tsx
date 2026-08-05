// Pattern: React Router v6 route tree + lazy-loaded routes.
// Dashboard and Login/Register load eagerly (always needed);
// Settings and Analytics are behind React.lazy() + <Suspense> so their code
// splits into separate chunks fetched on demand.

import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Layout/Sidebar";
import ProtectedRoute from "./components/Layout/ProtectedRoute";
import Login from "./views/Login";
import Register from "./views/Register";
import Dashboard from "./views/Dashboard";
import { useAuth } from "./hooks/useAuth";

const Settings = lazy(() => import("./views/Settings"));
const Analytics = lazy(() => import("./views/Analytics"));

function RouteFallback(): JSX.Element {
  return <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading…</div>;
}

function AppShell(): JSX.Element {
  const { isAuthenticated } = useAuth();

  return (
    <div className="flex h-screen">
      {isAuthenticated && <Sidebar />}
      <main className="flex-1 overflow-y-auto">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <ProtectedRoute>
                  <Analytics />
                </ProtectedRoute>
              }
            />
            {/* Settings guards itself via the withAuth HOC (see views/Settings.tsx). */}
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
