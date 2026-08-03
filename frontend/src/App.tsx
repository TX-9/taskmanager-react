// Pattern: React Router v6 route tree. Deliberately minimal for now — just
// enough to prove the login flow end-to-end. Register (Chunk 17),
// Settings/Analytics/Sidebar (Chunk 22), and the ErrorBoundary (Chunk 23)
// layer on top of this incrementally.

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/Layout/ProtectedRoute";
import Login from "./views/Login";
import Dashboard from "./views/Dashboard";

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
