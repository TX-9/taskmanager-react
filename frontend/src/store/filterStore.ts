// Pattern: filter/sort state via Zustand (State management section). Unlike
// AuthContext/TaskContext, this state doesn't need React re-render scoping
// tricks or a Provider — it lives in a module-level store so it persists
// across route navigation (e.g. leaving Dashboard for Analytics and back)
// without lifting it to a common ancestor or stuffing it in the URL.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TaskPriority, TaskStatus } from "../types/task";

export type PrioritySort = "NONE" | "HIGH_FIRST" | "LOW_FIRST";

interface FilterState {
  statusFilter: TaskStatus | "ALL";
  prioritySort: PrioritySort;
  priorityFilter: TaskPriority | "ALL";
  searchQuery: string;
  setStatusFilter: (status: TaskStatus | "ALL") => void;
  setPriorityFilter: (priority: TaskPriority | "ALL") => void;
  setPrioritySort: (sort: PrioritySort) => void;
  setSearchQuery: (query: string) => void;
  reset: () => void;
}

const initialState = {
  statusFilter: "ALL" as const,
  priorityFilter: "ALL" as const,
  prioritySort: "NONE" as const,
  searchQuery: "",
};

/*
Without persist, the store still works the same way during a session — state survives route changes (Dashboard → Analytics → back) because the module stays loaded in memory.
What you lose:
Page refresh → store resets to initialState (all filters cleared)
New tab → starts fresh, no shared filter state between tabs
With persist, Zustand writes to localStorage on every set call and reads from it on first load, so filters survive both.
*/
export const useFilterStore = create<FilterState>()(
  persist(
    (set) => ({
      ...initialState,
      setStatusFilter: (status) => set({ statusFilter: status }),
      setPriorityFilter: (priority) => set({ priorityFilter: priority }),
      setPrioritySort: (sort) => set({ prioritySort: sort }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      reset: () => set(initialState),
    }),
    // writes to localStorage on every set; rehydrates on load — without this, filters reset on page refresh
    { name: "taskmanager-filters" },
  ),
);
