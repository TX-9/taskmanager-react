// Pattern: custom hook wrapping Context API. Keeps `useContext(AuthContext)` + null-check out of every component that needs
// auth state, and gives us one place to throw a helpful error if the hook is used outside <AuthProvider>.

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }
  return context;
}
