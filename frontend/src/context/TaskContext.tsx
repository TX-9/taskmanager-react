// Pattern: reducer + Context standing in for the role Apollo's normalized
// cache played in the original — a single source of truth for server-derived
// task list state that any component/hook can read or dispatch into without
// prop drilling. No equivalent context exists in the original at all; there,
// `tasks`/`totalCount`/pagination lived implicitly inside Apollo's cache
// rather than as an explicit value anyone had to wire up.

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { initialTaskState, taskReducer, type TaskAction, type TaskState } from "./reducers/taskReducer";

export interface TaskContextValue {
  state: TaskState;
  dispatch: Dispatch<TaskAction>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);

  return <TaskContext.Provider value={{ state, dispatch }}>{children}</TaskContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTaskContext(): TaskContextValue {
  const value = useContext(TaskContext);
  if (!value) {
    throw new Error("useTaskContext must be used within a TaskProvider.");
  }
  return value;
}
