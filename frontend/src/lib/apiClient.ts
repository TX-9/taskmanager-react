// Pattern: hand-rolled GraphQL fetch client, replacing what Apollo's
// authLink + errorLink did automatically (see AUTH.md for the original's
// version): attach the JWT to every request, and force a logout when the
// server reports the token is missing/invalid.
//
// GraphQL errors return HTTP 200 with an `errors[]` array in the response
// body — a request can "succeed" at the HTTP layer while still failing at
// the GraphQL layer, so both have to be checked. `extensions.code` on each
// error (see api/src/utils/errors.ts) is the stable machine-readable value
// to branch on instead of matching against message strings.

import { AUTH_LOGOUT_EVENT, clearAuthToken, getAuthToken } from "./authToken";

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
}

interface GraphQLErrorShape {
  message: string;
  extensions?: {
    code?: string;
    http?: { status?: number };
  };
}

interface GraphQLResponseBody<TData> {
  data?: TData;
  errors?: GraphQLErrorShape[];
}

function forceLogout(): void {
  clearAuthToken();
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
}

function toApiError(message: string, code?: string, status?: number): ApiError {
  return { message, code, status };
}

export async function graphqlRequest<TData, TVariables extends Record<string, unknown> = Record<string, unknown>>(
  query: string,
  variables?: TVariables,
): Promise<TData> {
  const token = getAuthToken();
  // import.meta.env is a Vite feature that exposes environment variables from .env file at build time.
  const response = await fetch(import.meta.env.VITE_GRAPHQL_HTTP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 401) {
    forceLogout();
    throw toApiError("Your session has expired. Please log in again.", "UNAUTHENTICATED", 401);
  }

  if (!response.ok) {
    throw toApiError(`Request failed with status ${response.status}.`, undefined, response.status);
  }

  const body = (await response.json()) as GraphQLResponseBody<TData>;

  const firstError = body.errors?.[0];
  if (firstError) {
    const code = firstError.extensions?.code;
    const status = firstError.extensions?.http?.status;

    if (code === "UNAUTHENTICATED") {
      forceLogout();
    }

    throw toApiError(firstError.message, code, status);
  }

  return body.data as TData;
}
