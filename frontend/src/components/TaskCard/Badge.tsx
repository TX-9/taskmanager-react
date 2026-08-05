// Pattern: typed variant props via discriminated union (TypeScript section).
// `BadgeProps` forces callers to pass a matching `value` for the chosen
// `kind` — passing a TaskPriority value with kind="status" is a compile error.

import type { BadgeProps } from "../../types/task";

const STATUS_STYLES: Record<string, string> = {
  TODO: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  DONE: "bg-green-100 text-green-700",
};

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

function Badge(props: BadgeProps): JSX.Element {
  const styles = props.kind === "status" ? STATUS_STYLES[props.value] : PRIORITY_STYLES[props.value];
  const label = props.kind === "status" ? STATUS_LABELS[props.value] : props.value;

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles ?? ""}`}
    >
      {label}
    </span>
  );
}

export default Badge;
