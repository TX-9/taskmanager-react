// Mocks global fetch — no real network calls. Covers: JWT attachment,
// GraphQL errors-return-HTTP-200 handling, and that both an HTTP 401 and a
// resolver-level UNAUTHENTICATED error force a logout (clear token + dispatch
// AUTH_LOGOUT_EVENT).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { graphqlRequest, toError } from "./apiClient";
import { AUTH_LOGOUT_EVENT, setAuthToken } from "./authToken";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("graphqlRequest", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches the Authorization header when a token is stored", async () => {
    setAuthToken("abc123");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { data: { ok: true } }));

    await graphqlRequest("query { ok }");

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer abc123");
  });

  it("omits the Authorization header when no token is stored", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { data: { ok: true } }));

    await graphqlRequest("query { ok }");

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it("resolves with body.data on a normal successful response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(200, { data: { me: { id: "u1" } } }));

    const result = await graphqlRequest<{ me: { id: string } }>("query Me { me { id } }");

    expect(result).toEqual({ me: { id: "u1" } });
  });

  it("an HTTP 401 forces a logout and rejects", async () => {
    setAuthToken("stale-token");
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
    const logoutListener = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, logoutListener);

    await expect(graphqlRequest("query { me { id } }")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    expect(localStorage.getItem("taskmanager_token")).toBeNull();
    expect(logoutListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(AUTH_LOGOUT_EVENT, logoutListener);
  });

  it("a resolver-level UNAUTHENTICATED GraphQL error (HTTP 200) also forces a logout", async () => {
    setAuthToken("stale-token");
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, {
        errors: [{ message: "You must be logged in.", extensions: { code: "UNAUTHENTICATED", http: { status: 401 } } }],
      }),
    );
    const logoutListener = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, logoutListener);

    await expect(graphqlRequest("query { me { id } }")).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
      message: "You must be logged in.",
    });

    expect(localStorage.getItem("taskmanager_token")).toBeNull();
    expect(logoutListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(AUTH_LOGOUT_EVENT, logoutListener);
  });

  it("a non-auth GraphQL error rejects without forcing a logout", async () => {
    setAuthToken("valid-token");
    vi.spyOn(global, "fetch").mockResolvedValue(
      jsonResponse(200, {
        errors: [{ message: "Task title is required.", extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } }],
      }),
    );
    const logoutListener = vi.fn();
    window.addEventListener(AUTH_LOGOUT_EVENT, logoutListener);

    await expect(graphqlRequest("mutation { createTask }")).rejects.toMatchObject({
      code: "BAD_USER_INPUT",
      message: "Task title is required.",
    });

    expect(localStorage.getItem("taskmanager_token")).toBe("valid-token");
    expect(logoutListener).not.toHaveBeenCalled();

    window.removeEventListener(AUTH_LOGOUT_EVENT, logoutListener);
  });

  it("a non-2xx HTTP failure (not 401) rejects with a status-based message", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 500 }));

    await expect(graphqlRequest("query { ok }")).rejects.toMatchObject({ status: 500 });
  });
});

describe("toError", () => {
  it("returns an Error instance as-is", () => {
    const original = new Error("boom");
    expect(toError(original, "fallback")).toBe(original);
  });

  it("wraps an ApiError-shaped object using its message", () => {
    const error = toError({ message: "Task title is required.", code: "BAD_USER_INPUT" }, "fallback");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Task title is required.");
  });

  it("falls back to the provided message for anything else", () => {
    expect(toError("a plain string", "fallback message").message).toBe("fallback message");
    expect(toError(null, "fallback message").message).toBe("fallback message");
  });
});
