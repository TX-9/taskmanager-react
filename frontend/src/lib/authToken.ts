// Pattern: JWT token storage — backed by localStorage, plus a logout event so
// non-React code (e.g. apiClient.ts's error handling) can signal AuthContext
// to clear its state without a circular import.

const AUTH_TOKEN_KEY = "taskmanager_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** Fired on a 401/UNAUTHENTICATED response so AuthContext can clear state without a circular import. */
export const AUTH_LOGOUT_EVENT = "taskmanager:auth-logout";
