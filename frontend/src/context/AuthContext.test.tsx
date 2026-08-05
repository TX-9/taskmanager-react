// Regression test for the original's "known gap": mounting with a stored
// token must resolve session state out of "loading" (to "success" or
// "idle"), not hang there forever. Chunk 15 fixed this by driving
// resolution through a real `me` query instead of leaving nothing to ever
// call it.

import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "../hooks/useAuth";

const fakeUser = { id: "u1", email: "demo@taskmanager.dev", createdAt: new Date().toISOString() };

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function StatusProbe(): JSX.Element {
  const { state, user } = useAuth();
  return <p>status: {state.status} {user ? `(${user.email})` : ""}</p>;
}

describe("AuthContext — refresh-with-stored-token regression", () => {
  it("resolves to success when the stored token is valid", async () => {
    localStorage.setItem("taskmanager_token", "a-valid-token");
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ data: { me: fakeUser } }));

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    // Must start in "loading" (a token exists, unresolved yet) — asserting
    // this is what makes the test a regression guard: without Chunk 15's
    // fix, it would still say "loading" forever, never reaching "success".
    expect(screen.getByText(/status: loading/)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText(/status: success/)).toBeTruthy();
    });
    expect(screen.getByText(/demo@taskmanager\.dev/)).toBeTruthy();
  });

  it("resolves to idle (not stuck loading) when the stored token is stale", async () => {
    localStorage.setItem("taskmanager_token", "a-stale-token");
    vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse({ data: { me: null } }));

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/status: idle/)).toBeTruthy();
    });
  });

  it("starts (and stays) idle when there's no stored token at all", async () => {
    localStorage.clear();
    const fetchSpy = vi.spyOn(global, "fetch");

    render(
      <AuthProvider>
        <StatusProbe />
      </AuthProvider>,
    );

    expect(screen.getByText(/status: idle/)).toBeTruthy();
    // No token means no reason to ever call `me` — confirms the "skip the
    // network call entirely" branch in AuthContext's meFetcher.
    expect(fetchSpy).not.toHaveBeenCalled();

    // Flush useAsyncFetch's still-pending internal state update (it resolves
    // `null` synchronously-ish via a microtask even when skipping the
    // network call) so it doesn't land during the next test's render.
    await act(async () => {
      await Promise.resolve();
    });
  });
});
