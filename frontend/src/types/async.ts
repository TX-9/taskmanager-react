// AsyncState<T> models async operations as a discriminated union rather than
// Apollo's raw { loading, error, data } bag. The bag approach allows impossible
// combinations — loading: true AND data: {...}, or error AND data both set —
// because the three fields are independent booleans with no constraint between
// them. TypeScript cannot prevent you from reading `data` while `loading` is
// true; you rely on convention and manual checks.
//
// A discriminated union fixes this by making each state a separate object shape
// sharing one common field (`status`). Checking `status` is all TypeScript
// needs to know which shape you have, and it then enforces which other fields
// exist on that shape:
//
//   if (state.status === "success") {
//     state.data   // ✅ TypeScript knows `data` exists here
//     state.error  // ❌ compile error — not on this variant
//   }
//
// The variants are mutually exclusive by construction — "success" and "error"
// are separate types in the union, so they cannot coexist. Illegal states are
// unrepresentable: the bad combinations don't exist as valid types.

export type AsyncState<T> =
  | { status: "idle" }      // not yet triggered
  | { status: "loading" }   // request in flight, no data yet
  | { status: "success"; data: T }   // resolved — `data` is guaranteed present
  | { status: "error"; error: Error }; // failed — `error` is guaranteed present

// Type guard helpers so callers can write `if (isSuccess(state))` instead of
// `if (state.status === "success")`. The `state is X` return type tells
// TypeScript to narrow `state` to that specific variant inside the if-block.
export function isIdle<T>(state: AsyncState<T>): state is { status: "idle" } {
  return state.status === "idle";
}

export function isLoading<T>(state: AsyncState<T>): state is { status: "loading" } {
  return state.status === "loading";
}

export function isSuccess<T>(state: AsyncState<T>): state is { status: "success"; data: T } {
  return state.status === "success";
}

export function isError<T>(state: AsyncState<T>): state is { status: "error"; error: Error } {
  return state.status === "error";
}
