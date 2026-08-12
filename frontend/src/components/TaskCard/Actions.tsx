// Pattern: compound component part + useCallback handlers passed down from
// the list (Hooks section). `onStatusChange`/`onDelete` here are already
// bound to a specific task by the caller (see `TaskListItem` in
// views/Dashboard.tsx) — this component itself takes single-value callbacks
// and doesn't know or care which task it's for. The actual re-render-
// prevention machinery (making sure sibling TaskCards don't re-render when
// one task changes) lives entirely in `TaskListItem`'s use of React.memo,
// not in this file — see the comment above `TaskListItem` in
// views/Dashboard.tsx.
//
// The status <select> is the only status control — it covers the TODO⇄DONE
// case a dedicated "Toggle" button used to handle, plus IN_PROGRESS, which
// toggle could never reach.

import type { TaskStatus } from "../../types/task";

interface TaskCardActionsProps {
  status: TaskStatus;
  onStatusChange: (status: TaskStatus) => void;
  onDelete: () => void;
  isDeleting?: boolean;
}

function Actions({ status, onStatusChange, onDelete, isDeleting }: TaskCardActionsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as TaskStatus)}
        aria-label="Task status"
        className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700"
      >
        <option value="TODO">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="DONE">Done</option>
      </select>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {isDeleting ? "..." : "Delete"}
      </button>
    </div>
  );
}

export default Actions;
