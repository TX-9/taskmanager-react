// Pattern: reducer + Context

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from "react";
import { initialTaskState, taskReducer, type TaskAction, type TaskState } from "./reducers/taskReducer";
import { AUTH_LOGOUT_EVENT } from "../lib/authToken";

export interface TaskContextValue {
  state: TaskState;
  dispatch: Dispatch<TaskAction>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);

  // Listens here rather than in useTaskMutations so the reset
  // fires exactly once regardless of which views/hooks happen to be mounted.
  useEffect(() => {
    const handleLogout = (): void => dispatch({ type: "RESET" });
    window.addEventListener(AUTH_LOGOUT_EVENT, handleLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleLogout);
  }, []);

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
