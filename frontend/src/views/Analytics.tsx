// Pattern: route-level code splitting — lazy-loaded in
// App.tsx alongside Settings, so analytics-only code never ships to users who
// only ever visit the Dashboard.

import { useCallback, useMemo } from "react";
import { useAsyncFetch } from "../hooks/useAsyncFetch";
import { graphqlRequest } from "../lib/apiClient";
import { TASKS_QUERY } from "../graphql/queries";
import type { TasksQuery, TasksQueryVariables } from "../graphql/generated";
import type { TaskPriority, TaskStatus } from "../types/task";

const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

function Analytics(): JSX.Element {
  // Uses useAsyncFetch directly rather than useTasks:
  // this view deliberately stays outside TaskContext since it's read-only
  // and needs a different, unfiltered/unpaginated scope (up to 100 tasks,
  // ignoring whatever filterStore/Dashboard currently has selected) than
  // the shared task list Dashboard reads and mutates.
  const fetchTasks = useCallback(
    () => graphqlRequest<TasksQuery, TasksQueryVariables>(TASKS_QUERY, { page: 1, limit: 100 }),
    [],
  );
  const { state } = useAsyncFetch(fetchTasks, []);

  const tasks = useMemo(() => (state.status === "success" ? state.data.tasks.tasks : []), [state]);

  // Pattern: useMemo for derived stats.
  const byStatus = useMemo(() => {
    const counts: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
    for (const task of tasks) {
      counts[task.status] += 1;
    }
    return counts;
  }, [tasks]);

  const byPriority = useMemo(() => {
    const counts: Record<TaskPriority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    for (const task of tasks) {
      counts[task.priority] += 1;
    }
    return counts;
  }, [tasks]);

  const total = tasks.length;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Analytics</h1>

      {state.status === "loading" && <p className="text-sm text-gray-400">Loading…</p>}
      {state.status === "error" && (
        <p className="text-sm text-red-600">Failed to load analytics: {state.error.message}</p>
      )}

      {state.status === "success" && (
        <div className="space-y-6">
          <BreakdownCard title="By status" total={total} counts={byStatus} labels={STATUS_LABELS} />
          <BreakdownCard title="By priority" total={total} counts={byPriority} labels={PRIORITY_LABELS} />
        </div>
      )}
    </div>
  );
}

// K is inferred from `counts` and then enforced on `labels` — both must share the exact same keys.
// Missing a key in `labels` that exists in `counts` is a compile error, e.g.:
//   <BreakdownCard counts={byStatus} labels={{ TODO: "To do", IN_PROGRESS: "In progress" }} />
//   ❌ Property 'DONE' is missing in type '...' but required in type 'Record<TaskStatus, string>'
function BreakdownCard<K extends string>({
  title,
  total,
  counts,
  labels,
}: {
  title: string;
  total: number;
  counts: Record<K, number>;
  labels: Record<K, string>;
}): JSX.Element {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      <div className="space-y-2">
        {(Object.keys(counts) as K[]).map((key) => {
          const count = counts[key];
          const percentage = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex justify-between text-xs text-gray-500">
                <span>{labels[key]}</span>
                <span>
                  {count} ({percentage}%)
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Analytics;
