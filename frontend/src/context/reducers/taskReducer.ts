// Each optimistic action records what it needs to undo itself, keyed by task
// id in `pendingOperations`: UPDATE_OPTIMISTIC/DELETE_OPTIMISTIC snapshot the
// affected task (and, for delete, its list index) since there's a prior state
// to restore; CREATE_OPTIMISTIC just marks that a create is pending, since a
// brand-new task has no "before" to snapshot. CONFIRM and ROLLBACK look up
// that same id to decide how to resolve the operation — swap in the server's
// real data, or restore the exact prior state.

import type { Task, TaskPage } from "../../types/task";

interface PendingCreate {
  type: "create";
}

interface PendingUpdate {
  type: "update";
  snapshot: Task;
}

interface PendingDelete {
  type: "delete";
  snapshot: Task;
  index: number;
}

type PendingOperation = PendingCreate | PendingUpdate | PendingDelete;

export interface TaskState {
  status: "idle" | "loading" | "success" | "error";
  error: Error | null;
  tasks: Task[];
  totalCount: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  isLoadingMore: boolean;
  pendingOperations: Record<string, PendingOperation>;
}

export const initialTaskState: TaskState = {
  status: "idle",
  error: null,
  tasks: [],
  totalCount: 0,
  page: 1,
  limit: 20,
  hasNextPage: false,
  isLoadingMore: false,
  pendingOperations: {},
};

export type TaskAction =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: TaskPage }
  | { type: "FETCH_ERROR"; payload: Error }
  | { type: "LOAD_MORE_START" }
  | { type: "LOAD_MORE_SUCCESS"; payload: TaskPage }
  | { type: "LOAD_MORE_ERROR" }
  | { type: "CREATE_OPTIMISTIC"; task: Task }
  | { type: "UPDATE_OPTIMISTIC"; id: string; changes: Partial<Task> }
  | { type: "DELETE_OPTIMISTIC"; id: string }
  | { type: "CONFIRM"; id: string; task?: Task }
  | { type: "ROLLBACK"; id: string }
  | { type: "RESET" };

function withoutPending(
  pendingOperations: Record<string, PendingOperation>,
  id: string,
): Record<string, PendingOperation> {
  const next = { ...pendingOperations };
  delete next[id];
  return next;
}

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, status: "loading", error: null };

    case "FETCH_SUCCESS":
      return {
        ...state,
        status: "success",
        error: null,
        tasks: action.payload.tasks,
        totalCount: action.payload.totalCount,
        page: action.payload.page,
        limit: action.payload.limit,
        hasNextPage: action.payload.hasNextPage,
        // A fresh page-1 result is fully authoritative — any operation still
        // pending against the previous list no longer corresponds to
        // anything meaningful.
        pendingOperations: {},
      };

    case "FETCH_ERROR":
      return { ...state, status: "error", error: action.payload };

    case "LOAD_MORE_START":
      return { ...state, isLoadingMore: true };

    case "LOAD_MORE_SUCCESS":
      return {
        ...state,
        isLoadingMore: false,
        tasks: [...state.tasks, ...action.payload.tasks],
        totalCount: action.payload.totalCount,
        page: action.payload.page,
        limit: action.payload.limit,
        hasNextPage: action.payload.hasNextPage,
      };

    case "LOAD_MORE_ERROR":
      return { ...state, isLoadingMore: false };

    case "CREATE_OPTIMISTIC":
      return {
        ...state,
        tasks: [action.task, ...state.tasks],
        totalCount: state.totalCount + 1,
        pendingOperations: {
          ...state.pendingOperations,
          [action.task.id]: { type: "create" },
        },
      };

    case "UPDATE_OPTIMISTIC": {
      const existing = state.tasks.find((task) => task.id === action.id);
      if (!existing) {
        return state;
      }
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.id ? { ...task, ...action.changes } : task)),
        pendingOperations: {
          ...state.pendingOperations,
          [action.id]: { type: "update", snapshot: existing },
        },
      };
    }

    case "DELETE_OPTIMISTIC": {
      const index = state.tasks.findIndex((task) => task.id === action.id);
      const snapshot = state.tasks[index];
      if (index === -1 || !snapshot) {
        return state;
      }
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.id),
        totalCount: state.totalCount - 1,
        pendingOperations: {
          ...state.pendingOperations,
          [action.id]: { type: "delete", snapshot, index },
        },
      };
    }

    case "CONFIRM": {
      const pending = state.pendingOperations[action.id];
      if (!pending) {
        return state;
      }

      if (pending.type === "delete") {
        // Already removed on the optimistic pass — nothing left to reconcile.
        return { ...state, pendingOperations: withoutPending(state.pendingOperations, action.id) };
      }

      if (!action.task) {
        return state;
      }

      // Covers both create (swaps the temp-id entry for the server's real
      // task) and update (replaces the optimistic guess with server truth) —
      // both just mean "replace whatever is at this id with `confirmedTask`".
      const confirmedTask = action.task;
      return {
        ...state,
        tasks: state.tasks.map((task) => (task.id === action.id ? confirmedTask : task)),
        pendingOperations: withoutPending(state.pendingOperations, action.id),
      };
    }

    case "ROLLBACK": {
      const pending = state.pendingOperations[action.id];
      if (!pending) {
        return state;
      }

      if (pending.type === "create") {
        return {
          ...state,
          tasks: state.tasks.filter((task) => task.id !== action.id),
          totalCount: state.totalCount - 1,
          pendingOperations: withoutPending(state.pendingOperations, action.id),
        };
      }

      if (pending.type === "update") {
        return {
          ...state,
          tasks: state.tasks.map((task) => (task.id === action.id ? pending.snapshot : task)),
          pendingOperations: withoutPending(state.pendingOperations, action.id),
        };
      }

      // pending.type === "delete" — reinsert at the exact index it was removed from.
      const tasks = [...state.tasks];
      tasks.splice(pending.index, 0, pending.snapshot);
      return {
        ...state,
        tasks,
        totalCount: state.totalCount + 1,
        pendingOperations: withoutPending(state.pendingOperations, action.id),
      };
    }

    case "RESET":
      // Logout clears whatever the previous session's tasks were.
      //  So the next user on this tab never sees a flash of stale data.
      return initialTaskState;

    default:
      return state;
  }
}
