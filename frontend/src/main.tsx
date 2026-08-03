// Entry point — wraps the app in AuthProvider (context/AuthContext.tsx) and
// TaskProvider (context/TaskContext.tsx) so every component can reach auth
// and task state without prop drilling. No ApolloProvider — never existed
// in this variant.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import { TaskProvider } from "./context/TaskContext";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html.");
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <TaskProvider>
        <App />
      </TaskProvider>
    </AuthProvider>
  </StrictMode>,
);
