// Pattern: custom hook wrapping a plain fetch call (Custom hooks section).
// apiClient.graphqlRequest(TASKS_QUERY, ...) and dispatches into TaskContext

import { useCallback, useEffect, useMemo } from "react";
import { graphqlRequest, toError } from "../lib/apiClient";
import { TASKS_QUERY } from "../graphql/queries";
import type { TasksQuery, TasksQueryVariables } from "../graphql/generated";
import { useTaskContext } from "../context/TaskContext";
import type { AsyncState } from "../types/async";
import type { TaskFilter, TaskPage } from "../types/task";

const DEFAULT_LIMIT = 20;

export interface UseTasksResult {
  state: AsyncState<TaskPage>;
  loadMore: () => void;
  isLoadingMore: boolean;
  refetch: () => void;
}

export function useTasks(filter?: TaskFilter, limit: number = DEFAULT_LIMIT): UseTasksResult {
  const { state: taskState, dispatch } = useTaskContext();

  const fetchPage = useCallback(
    (page: number) => graphqlRequest<TasksQuery, TasksQueryVariables>(TASKS_QUERY, { page, limit, filter }),
    [limit, filter],
  );

  // Fresh page-1 fetch, used both on mount/filter-change and for refetch().
  const fetchFirstPage = useCallback(() => {
    dispatch({ type: "FETCH_START" });
    return fetchPage(1)
      .then((data) => {
        dispatch({ type: "FETCH_SUCCESS", payload: data.tasks });
      })
      .catch((error: unknown) => {
        dispatch({ type: "FETCH_ERROR", payload: toError(error, "Failed to load tasks.") });
      });
  }, [fetchPage, dispatch]);

  useEffect(() => {
    // Guards against a stale response landing after `filter`/`limit` change
    // again before this request resolves.
    let cancelled = false;
    dispatch({ type: "FETCH_START" });
    fetchPage(1)
      .then((data) => {
        if (!cancelled) {
          dispatch({ type: "FETCH_SUCCESS", payload: data.tasks });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "FETCH_ERROR", payload: toError(error, "Failed to load tasks.") });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, limit]);

  const loadMore = useCallback(() => {
    if (taskState.status !== "success" || !taskState.hasNextPage || taskState.isLoadingMore) {
      return;
    }
    const nextPage = taskState.page + 1;
    dispatch({ type: "LOAD_MORE_START" });
    fetchPage(nextPage)
      .then((data) => {
        dispatch({ type: "LOAD_MORE_SUCCESS", payload: data.tasks });
      })
      .catch(() => {
        dispatch({ type: "LOAD_MORE_ERROR" });
      });
  }, [taskState.status, taskState.hasNextPage, taskState.isLoadingMore, taskState.page, fetchPage, dispatch]);

  // Reshapes reducer state into the public AsyncState<TaskPage> shape.
  // useMemo keeps the object reference stable so consumers don't re-render when taskState hasn't changed.
  const state = useMemo<AsyncState<TaskPage>>(() => {
    if (taskState.status === "error") {
      return { status: "error", error: taskState.error ?? new Error("Failed to load tasks.") };
    }
    if (taskState.status === "loading") {
      return { status: "loading" };
    }
    if (taskState.status === "idle") {
      return { status: "idle" };
    }
    return {
      status: "success",
      data: {
        tasks: taskState.tasks,
        totalCount: taskState.totalCount,
        page: taskState.page,
        limit: taskState.limit,
        hasNextPage: taskState.hasNextPage,
      },
    };
  }, [taskState]);

  return {
    state,
    loadMore,
    isLoadingMore: taskState.isLoadingMore,
    refetch: () => void fetchFirstPage(),
  };
}
