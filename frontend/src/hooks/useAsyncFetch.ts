// Pattern: generic async-fetch hook, translating a raw async call into the AsyncState<T> discriminated union

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

  // Always call the latest `fetcher` without making it a dependency itself — callers typically pass a fresh inline function each render,
  // and adding it to the effect's deps would refetch on every render regardless of `deps`.
  const fetcherRef = useRef(fetcher); // creates a mutable box. The initial value only matters on the very first render; useRef does not re-initialize on subsequent renders.
  fetcherRef.current = fetcher; // runs on every render and keeps fetcherRef.current pointing to the newest fetcher function the caller just passed in.

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

  return { state, refetch: run }; // run is already stable (empty dep array)
}
