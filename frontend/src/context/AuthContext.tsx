// Pattern: AuthContext via Context API (State management section) — wraps the
// entire app in main.tsx so any component can read the current user without
// prop drilling. Session state (async login/logout) is modelled as
// AsyncState<User> rather than ad-hoc booleans (TypeScript section).
//
// Reuses the original's overall structure (AuthContext + AuthProvider,
// session state as AsyncState<User>, login/register/logout methods, the
// AUTH_LOGOUT_EVENT listener), but login/register go through
// apiClient.graphqlRequest instead of Apollo's useLoginMutation/
// useRegisterMutation, and logout resets local state directly instead of
// apolloClient.clearStore() — there's no Apollo cache to wipe. TaskContext
// separately listens for the same AUTH_LOGOUT_EVENT (Chunk 18) and resets
// itself, which is what clearStore() did for task data in the original.
//
// Unlike the original, this version also actually fixes the "known gap" it
// shipped with: there, a page refresh with an existing token left session
// state stuck at "loading" forever, because nothing ever called `me` to
// resolve it. Here, `useAsyncFetch` (Chunk 14) drives that resolution — see
// the comment above its usage below.

import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AsyncState } from "../types/async";
import type { User } from "../types/user";
import { graphqlRequest, toError } from "../lib/apiClient";
import { AUTH_LOGOUT_EVENT, clearAuthToken, getAuthToken, setAuthToken } from "../lib/authToken";
import { LOGIN_MUTATION, REGISTER_MUTATION } from "../graphql/mutations";
import { ME_QUERY } from "../graphql/queries";
import type {
  AuthPayload,
  LoginMutation,
  LoginMutationVariables,
  MeQuery,
  RegisterMutation,
  RegisterMutationVariables,
} from "../graphql/generated";
import { useAsyncFetch } from "../hooks/useAsyncFetch";

export interface AuthContextValue {
  state: AsyncState<User>;
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  // If a token already exists (e.g. page refresh), start in "loading" rather
  // than defaulting to "logged out" — we know there *was* a session, we just
  // haven't confirmed it's still valid yet. The `me` fetch below is what
  // actually resolves this.
  const [state, setState] = useState<AsyncState<User>>(() =>
    getAuthToken() ? { status: "loading" } : { status: "idle" },
  );

  const handleAuthPayload = useCallback((payload: AuthPayload) => {
    setAuthToken(payload.token);
    setState({ status: "success", data: payload.user });
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setState({ status: "idle" });
    // Same event apiClient.ts dispatches on a 401/UNAUTHENTICATED response,
    // so TaskContext only needs to listen for one thing regardless of
    // whether the logout was user-initiated or forced by an expired token.
    window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setState({ status: "loading" });
      try {
        const data = await graphqlRequest<LoginMutation, LoginMutationVariables>(LOGIN_MUTATION, {
          email,
          password,
        });
        handleAuthPayload(data.login);
      } catch (error) {
        const normalized = toError(error, "Login failed.");
        setState({ status: "error", error: normalized });
        throw normalized;
      }
    },
    [handleAuthPayload],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setState({ status: "loading" });
      try {
        const data = await graphqlRequest<RegisterMutation, RegisterMutationVariables>(REGISTER_MUTATION, {
          email,
          password,
        });
        handleAuthPayload(data.register);
      } catch (error) {
        const normalized = toError(error, "Registration failed.");
        setState({ status: "error", error: normalized });
        throw normalized;
      }
    },
    [handleAuthPayload],
  );

  // Skips the network call entirely when there's no
  // stored token — nothing to resolve.
  const meFetcher = useCallback(async (): Promise<User | null> => {
    if (!getAuthToken()) {
      return null;
    }
    const data = await graphqlRequest<MeQuery>(ME_QUERY);

    // Any async function automatically wraps its return value in a Promise, no matter what returns
    return data.me;
  }, []);
  const { state: meState } = useAsyncFetch<User | null>(meFetcher, []);

  useEffect(() => {
    if (meState.status === "success") {
      // `me: null` means the stored token is stale/invalid — resolve to
      // logged-out rather than leaving the caller waiting.
      setState(meState.data ? { status: "success", data: meState.data } : { status: "idle" });
    } else if (meState.status === "error") {
      // graphqlRequest already forced a logout (cleared the token, dispatched
      // AUTH_LOGOUT_EVENT) if this was an UNAUTHENTICATED/401 failure; either
      // way, an unresolvable `me` call means treat the session as logged out
      // rather than surfacing a hard error on app load.
      setState({ status: "idle" });
    }
  }, [meState]);

  // Dispatched by apiClient.ts (graphqlRequest) on a 401/UNAUTHENTICATED
  // response from any request, or by logout() above.
  useEffect(() => {
    const handleForcedLogout = (): void => setState({ status: "idle" });
    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
  }, []);

  // Stable reference so context consumers don't re-render unless state,
  // login, register, or logout actually change (all callbacks are useCallback).
  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user: state.status === "success" ? state.data : null,
      isAuthenticated: state.status === "success",
      login,
      register,
      logout,
    }),
    [state, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
