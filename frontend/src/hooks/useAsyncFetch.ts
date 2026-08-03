// Pattern: generic async-fetch hook, modeled on the AsyncState-returning
// shape of the original's useTasks.ts (translating a raw async call into the
// AsyncState<T> discriminated union), but standalone rather than
// task-specific — for one-off reads (the `me` check in AuthContext,
// Analytics' full task list) that don't need to go through TaskContext's
// reducer.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AsyncState } from "../types/async";

export interface UseAsyncFetchResult<T> {
  state: AsyncState<T>;
  refetch: () => void;
}

export function useAsyncFetch<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): UseAsyncFetchResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "idle" });

  // Always call the latest `fetcher` without making it a dependency itself —
  // callers typically pass a fresh inline function each render, and adding it
  // to the effect's deps would refetch on every render regardless of `deps`.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) {
          setState({ status: "success", data });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: error instanceof Error ? error : new Error("Request failed.") });
        }
      });

    // Lets the effect below ignore a stale in-flight request's result if
    // `deps` change again (or the component unmounts) before it resolves.
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return run(); // run() executes immediately, returns () => { cancelled = true }
    // `deps` is caller-supplied and intentionally spread into this array —
    // exhaustive-deps can't verify a variable-length array, but `run` itself
    // is stable (empty dep list) so it's safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(() => {
    run();
  }, [run]);

  return { state, refetch };
}
