// Pattern: useDebounce custom hook. Used by the task
// search input so we don't refetch on every keystroke — see views/Dashboard.tsx.

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs: number): T {
  // Initial value only — React ignores this argument on re-renders.
  const [debouncedValue, setDebouncedValue] = useState(value);

  // On mount this redundantly sets debouncedValue to its initial value, but
  // React bails out of re-renders when state is set to the same primitive via
  // Object.is — harmless for primitives, but avoid passing new object/array
  // references on every render or consumers will re-render after each timeout.
  useEffect(() => {
    // Watch value and call setDebouncedValue (after the delay) to sync the state when the input changes
    const timeoutId = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(timeoutId);
  }, [value, delayMs]);

  return debouncedValue;
}
