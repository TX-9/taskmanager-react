// Pattern: generic optimistic-mutation wrapper. 
// There's no cache, so `runOptimistic` makes the three-step
// shape explicit: apply the optimistic change, await the real request, then
// either confirm (replace with server truth) or roll back (restore the exact
// prior state) — both by dispatching into taskReducer, which
// already knows how to resolve either outcome from the snapshot it captured
// when the optimistic action was applied.

import { useCallback } from "react";
import { useTaskContext } from "../context/TaskContext";
import { graphqlRequest, toError } from "../lib/apiClient";
import { CREATE_TASK_MUTATION, DELETE_TASK_MUTATION, TOGGLE_STATUS_MUTATION, UPDATE_TASK_MUTATION } from "../graphql/mutations";
import type {
  CreateTaskMutation,
  CreateTaskMutationVariables,
  DeleteTaskMutation,
  DeleteTaskMutationVariables,
  ToggleStatusMutation,
  ToggleStatusMutationVariables,
  UpdateTaskMutation,
  UpdateTaskMutationVariables,
} from "../graphql/generated";
import type { Task, TaskPriority, UpdateTaskInput } from "../types/task";

export interface UseTaskMutationsResult {
  createTask: (title: string, priority: TaskPriority) => Promise<void>;
  updateTask: (id: string, input: UpdateTaskInput) => Promise<void>;
  toggleStatus: (task: Task) => Promise<void>;
  deleteTask: (task: Task) => Promise<void>;
}

interface RunOptimisticParams<TResult> {
  apply: () => void;
  request: () => Promise<TResult>;
  confirm: (result: TResult) => void;
  rollback: () => void;
}

// Shared by all four mutations below: apply the optimistic dispatch
// synchronously, await the real request, then confirm on success or roll
// back on failure — rethrowing a normalized Error either way so call sites
// (e.g. Dashboard's form handlers) can surface it without needing to know
// rollback already happened.
async function runOptimistic<TResult>({ apply, request, confirm, rollback }: RunOptimisticParams<TResult>): Promise<void> {
  apply();
  try {
    const result = await request();
    confirm(result);
  } catch (error) {
    rollback();
    throw toError(error, "Mutation failed.");
  }
}

export function useTaskMutations(): UseTaskMutationsResult {
  const { dispatch } = useTaskContext();

  const createTask = useCallback(
    async (title: string, priority: TaskPriority) => {
      // Prefixed so it can never collide with a real UUID from the server —
      // taskReducer's CONFIRM swaps this entry for the server's real task by matching on this exact id.
      const optimisticId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimisticTask: Task = {
        id: optimisticId,
        title,
        priority,
        description: null,
        status: "TODO",
        createdAt: now,
        updatedAt: now,
        user: { id: "optimistic-user", email: "", createdAt: now },
      };

      await runOptimistic({
        apply: () => dispatch({ type: "CREATE_OPTIMISTIC", task: optimisticTask }),
        request: () =>
          graphqlRequest<CreateTaskMutation, CreateTaskMutationVariables>(CREATE_TASK_MUTATION, {
            input: { title, priority }
          }),
        confirm: (result) => dispatch({ type: "CONFIRM", id: optimisticId, task: result.createTask }),
        rollback: () => dispatch({ type: "ROLLBACK", id: optimisticId }),
      });
    },
    [dispatch],
  );

  const updateTask = useCallback(
    async (id: string, input: UpdateTaskInput) => {
      await runOptimistic({
        apply: () => dispatch({ type: "UPDATE_OPTIMISTIC", id, changes: input }),
        request: () =>
          graphqlRequest<UpdateTaskMutation, UpdateTaskMutationVariables>(UPDATE_TASK_MUTATION, { id, input }),
        confirm: (result) => dispatch({ type: "CONFIRM", id, task: result.updateTask }),
        rollback: () => dispatch({ type: "ROLLBACK", id }),
      });
    },
    [dispatch],
  );

  const toggleStatus = useCallback(
    async (task: Task) => {
      const nextStatus = task.status === "DONE" ? "TODO" : "DONE";

      await runOptimistic({
        apply: () => dispatch({ type: "UPDATE_OPTIMISTIC", id: task.id, changes: { status: nextStatus } }),
        request: () =>
          graphqlRequest<ToggleStatusMutation, ToggleStatusMutationVariables>(TOGGLE_STATUS_MUTATION, {
            id: task.id,
          }),
        confirm: (result) => dispatch({ type: "CONFIRM", id: task.id, task: result.toggleStatus }),
        rollback: () => dispatch({ type: "ROLLBACK", id: task.id }),
      });
    },
    [dispatch],
  );

  const deleteTask = useCallback(
    async (task: Task) => {
      await runOptimistic({
        apply: () => dispatch({ type: "DELETE_OPTIMISTIC", id: task.id }),
        request: () =>
          graphqlRequest<DeleteTaskMutation, DeleteTaskMutationVariables>(DELETE_TASK_MUTATION, {
            id: task.id,
          }),
        // deleteTask returns a bare ID, not a Task — nothing to swap in, the
        // optimistic removal already stands.
        confirm: () => dispatch({ type: "CONFIRM", id: task.id }),
        rollback: () => dispatch({ type: "ROLLBACK", id: task.id }),
      });
    },
    [dispatch],
  );

  return { createTask, updateTask, toggleStatus, deleteTask };
}
