// Pattern: compound component part + useCallback handlers passed down from
// the list (Hooks section). `onToggle`/`onDelete` here are already bound to
// a specific task by the caller (see `TaskListItem` in
// views/Dashboard.tsx) — this component itself takes no-argument callbacks
// and doesn't know or care which task it's for. The actual re-render-
// prevention machinery (making sure sibling TaskCards don't re-render when
// one task toggles) lives entirely in `TaskListItem`'s use of React.memo,
// not in this file — see the comment above `TaskListItem` in
// views/Dashboard.tsx for why that has to be a separate memoized wrapper
// rather than something achievable inside TaskCard/Actions alone.

interface TaskCardActionsProps {
  onToggle: () => void;
  onDelete: () => void;
  isToggling?: boolean;
  isDeleting?: boolean;
}

function Actions({ onToggle, onDelete, isToggling, isDeleting }: TaskCardActionsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={isToggling}
        className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {isToggling ? "..." : "Toggle"}
      </button>
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
