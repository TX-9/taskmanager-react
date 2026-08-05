// Pure function — no mocking needed. Covers fetch/pagination transitions and
// every optimistic apply -> confirm/rollback scenario the reducer supports.

import { describe, expect, it } from "vitest";
import { initialTaskState, taskReducer, type TaskState } from "./taskReducer";
import type { Task, TaskPage } from "../../types/task";

const fakeUser = { id: "u1", email: "demo@taskmanager.dev", createdAt: "2026-01-01T00:00:00.000Z" };

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    title: "Task",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    user: fakeUser,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makePage(overrides: Partial<TaskPage> = {}): TaskPage {
  return {
    tasks: [makeTask()],
    totalCount: 1,
    page: 1,
    limit: 20,
    hasNextPage: false,
    ...overrides,
  };
}

describe("taskReducer — fetch/pagination", () => {
  it("FETCH_START sets loading and clears any error", () => {
    const state = taskReducer(
      { ...initialTaskState, status: "error", error: new Error("previous") },
      { type: "FETCH_START" },
    );
    expect(state.status).toBe("loading");
    expect(state.error).toBeNull();
  });

  it("FETCH_SUCCESS replaces the list and clears pendingOperations", () => {
    const page = makePage({ tasks: [makeTask({ id: "a" }), makeTask({ id: "b" })], totalCount: 2 });
    const dirtyState: TaskState = {
      ...initialTaskState,
      pendingOperations: { stale: { type: "create" } },
    };

    const state = taskReducer(dirtyState, { type: "FETCH_SUCCESS", payload: page });

    expect(state.status).toBe("success");
    expect(state.tasks).toEqual(page.tasks);
    expect(state.totalCount).toBe(2);
    expect(state.pendingOperations).toEqual({});
  });

  it("FETCH_ERROR sets error status and stores the error", () => {
    const error = new Error("network down");
    const state = taskReducer(initialTaskState, { type: "FETCH_ERROR", payload: error });
    expect(state.status).toBe("error");
    expect(state.error).toBe(error);
  });

  it("LOAD_MORE_START/SUCCESS appends the next page without disturbing existing tasks", () => {
    const base: TaskState = {
      ...initialTaskState,
      status: "success",
      tasks: [makeTask({ id: "a" })],
      totalCount: 2,
      page: 1,
      hasNextPage: true,
    };

    const loading = taskReducer(base, { type: "LOAD_MORE_START" });
    expect(loading.isLoadingMore).toBe(true);

    const nextPage = makePage({ tasks: [makeTask({ id: "b" })], page: 2, totalCount: 2, hasNextPage: false });
    const state = taskReducer(loading, { type: "LOAD_MORE_SUCCESS", payload: nextPage });

    expect(state.isLoadingMore).toBe(false);
    expect(state.tasks.map((t) => t.id)).toEqual(["a", "b"]);
    expect(state.page).toBe(2);
    expect(state.hasNextPage).toBe(false);
  });

  it("LOAD_MORE_ERROR clears isLoadingMore without touching the list", () => {
    const base: TaskState = { ...initialTaskState, isLoadingMore: true, tasks: [makeTask()] };
    const state = taskReducer(base, { type: "LOAD_MORE_ERROR" });
    expect(state.isLoadingMore).toBe(false);
    expect(state.tasks).toEqual(base.tasks);
  });
});

describe("taskReducer — optimistic create", () => {
  it("CREATE_OPTIMISTIC prepends the task and marks it pending", () => {
    const optimisticTask = makeTask({ id: "temp-1" });
    const state = taskReducer(
      { ...initialTaskState, tasks: [makeTask({ id: "existing" })], totalCount: 1 },
      { type: "CREATE_OPTIMISTIC", task: optimisticTask },
    );

    expect(state.tasks.map((t) => t.id)).toEqual(["temp-1", "existing"]);
    expect(state.totalCount).toBe(2);
    expect(state.pendingOperations["temp-1"]).toEqual({ type: "create" });
  });

  it("CONFIRM swaps the temp-id entry for the server's real task", () => {
    const optimisticTask = makeTask({ id: "temp-1", title: "New task" });
    const created = taskReducer(initialTaskState, { type: "CREATE_OPTIMISTIC", task: optimisticTask });

    const realTask = makeTask({ id: "real-1", title: "New task" });
    const confirmed = taskReducer(created, { type: "CONFIRM", id: "temp-1", task: realTask });

    expect(confirmed.tasks).toEqual([realTask]);
    expect(confirmed.pendingOperations).toEqual({});
  });

  it("ROLLBACK removes the temp entry entirely (no prior state to restore)", () => {
    const optimisticTask = makeTask({ id: "temp-1" });
    const created = taskReducer(
      { ...initialTaskState, tasks: [makeTask({ id: "existing" })], totalCount: 1 },
      { type: "CREATE_OPTIMISTIC", task: optimisticTask },
    );

    const rolledBack = taskReducer(created, { type: "ROLLBACK", id: "temp-1" });

    expect(rolledBack.tasks.map((t) => t.id)).toEqual(["existing"]);
    expect(rolledBack.totalCount).toBe(1);
    expect(rolledBack.pendingOperations).toEqual({});
  });
});

describe("taskReducer — optimistic update (toggle)", () => {
  it("UPDATE_OPTIMISTIC applies the change instantly and snapshots the prior task", () => {
    const original = makeTask({ id: "t1", status: "TODO" });
    const base: TaskState = { ...initialTaskState, tasks: [original] };

    const state = taskReducer(base, { type: "UPDATE_OPTIMISTIC", id: "t1", changes: { status: "DONE" } });

    expect(state.tasks[0]?.status).toBe("DONE");
    expect(state.pendingOperations["t1"]).toEqual({ type: "update", snapshot: original });
  });

  it("CONFIRM replaces the optimistic guess with the server's task", () => {
    const original = makeTask({ id: "t1", status: "TODO" });
    const updated = taskReducer(
      { ...initialTaskState, tasks: [original] },
      { type: "UPDATE_OPTIMISTIC", id: "t1", changes: { status: "DONE" } },
    );

    const serverTask = makeTask({ id: "t1", status: "DONE", updatedAt: "2026-01-02T00:00:00.000Z" });
    const confirmed = taskReducer(updated, { type: "CONFIRM", id: "t1", task: serverTask });

    expect(confirmed.tasks).toEqual([serverTask]);
    expect(confirmed.pendingOperations).toEqual({});
  });

  it("ROLLBACK restores the exact prior task on failure", () => {
    const original = makeTask({ id: "t1", status: "TODO", title: "Original title" });
    const updated = taskReducer(
      { ...initialTaskState, tasks: [original] },
      { type: "UPDATE_OPTIMISTIC", id: "t1", changes: { status: "DONE" } },
    );

    const rolledBack = taskReducer(updated, { type: "ROLLBACK", id: "t1" });

    expect(rolledBack.tasks).toEqual([original]);
    expect(rolledBack.pendingOperations).toEqual({});
  });
});

describe("taskReducer — optimistic delete", () => {
  it("DELETE_OPTIMISTIC removes the task and snapshots its exact index", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const c = makeTask({ id: "c" });
    const base: TaskState = { ...initialTaskState, tasks: [a, b, c], totalCount: 3 };

    const state = taskReducer(base, { type: "DELETE_OPTIMISTIC", id: "b" });

    expect(state.tasks.map((t) => t.id)).toEqual(["a", "c"]);
    expect(state.totalCount).toBe(2);
    expect(state.pendingOperations["b"]).toEqual({ type: "delete", snapshot: b, index: 1 });
  });

  it("CONFIRM is a no-op on the list — already removed on the optimistic pass", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const deleted = taskReducer({ ...initialTaskState, tasks: [a, b], totalCount: 2 }, {
      type: "DELETE_OPTIMISTIC",
      id: "b",
    });

    const confirmed = taskReducer(deleted, { type: "CONFIRM", id: "b" });

    expect(confirmed.tasks.map((t) => t.id)).toEqual(["a"]);
    expect(confirmed.pendingOperations).toEqual({});
  });

  it("ROLLBACK reinserts the task at the exact index it was removed from", () => {
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const c = makeTask({ id: "c" });
    const deleted = taskReducer({ ...initialTaskState, tasks: [a, b, c], totalCount: 3 }, {
      type: "DELETE_OPTIMISTIC",
      id: "b",
    });

    const rolledBack = taskReducer(deleted, { type: "ROLLBACK", id: "b" });

    expect(rolledBack.tasks.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(rolledBack.totalCount).toBe(3);
    expect(rolledBack.pendingOperations).toEqual({});
  });
});

describe("taskReducer — RESET", () => {
  it("returns to the exact initial state, discarding tasks/pendingOperations", () => {
    const dirty: TaskState = {
      ...initialTaskState,
      status: "success",
      tasks: [makeTask()],
      totalCount: 1,
      pendingOperations: { t1: { type: "create" } },
    };

    expect(taskReducer(dirty, { type: "RESET" })).toEqual(initialTaskState);
  });
});

describe("taskReducer — actions on unknown ids are no-ops", () => {
  it("UPDATE_OPTIMISTIC/DELETE_OPTIMISTIC/CONFIRM/ROLLBACK ignore an id not in the list", () => {
    const base: TaskState = { ...initialTaskState, tasks: [makeTask({ id: "a" })] };

    expect(taskReducer(base, { type: "UPDATE_OPTIMISTIC", id: "missing", changes: { status: "DONE" } })).toEqual(
      base,
    );
    expect(taskReducer(base, { type: "DELETE_OPTIMISTIC", id: "missing" })).toEqual(base);
    expect(taskReducer(base, { type: "CONFIRM", id: "missing", task: makeTask() })).toEqual(base);
    expect(taskReducer(base, { type: "ROLLBACK", id: "missing" })).toEqual(base);
  });
});
