// Pattern: compound components — <TaskCard> is
// the root and exposes TaskCard.Header / TaskCard.Actions / TaskCard.Badge as
// static properties, so consumers compose exactly the pieces they need:
//
//   <TaskCard task={task}>
//     <TaskCard.Header task={task} />
//     <TaskCard.Badge kind="status" value={task.status} />
//     <TaskCard.Actions onToggle={...} onDelete={...} />
//   </TaskCard>
//
// Pattern: React.memo — wrapped so that toggling or
// deleting one task doesn't re-render every other TaskCard in the list, as
// long as its own `task` prop reference is unchanged.
//
// ⚠️ That guarantee also depends on `children` being stable between renders,
// which memo compares too — a caller that rebuilds
// `<TaskCard.Header>`/`<TaskCard.Badge>`/`<TaskCard.Actions>` as fresh
// elements inline on every render (e.g. directly inside a `.map()` or a
// `List` `renderItem` callback) would defeat this memo entirely, since
// `children` would count as "changed" every time regardless of `task`. This
// app's actual caller avoids that via the memoized `TaskListItem` wrapper in
// views/Dashboard.tsx, which is what makes this component's props (`task`
// and `children` alike) stable across unrelated re-renders — see the
// comment above `TaskListItem` there for the full explanation.
//
// TaskCard and its Header/Actions/Badge subcomponents never import anything
// from the data layer — they're pure presentation, receiving already-
// resolved `Task` data and plain callback props (`onToggle`/`onDelete`) from
// their caller. Every actual fetch/mutation call in this app's UI lives in
// frontend/src/views/Dashboard.tsx (via useTasks/useTaskMutations), which
// passes the results down as props. This separation is deliberate: it's
// what lets TaskCard be reused (e.g. in a future task-detail view) without
// dragging any data-fetching code along with it.

import { memo, type ReactNode } from "react";
import Header from "./Header";
import Actions from "./Actions";
import Badge from "./Badge";

interface TaskCardProps {
  children: ReactNode;
}

/*
{children} is an array of two elements:
[
  { type: Header, props: { task } },
  { type: "div", props: { className: "flex ...", children: [ Badge, Badge, Actions ] } }
]
  */
function TaskCardRoot({ children }: TaskCardProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}
/*
the parent (Dashboard.tsx) renders a list of tasks.
When you toggle or delete one task, the list state changes and Dashboard re-renders
— which would normally re-render every TaskCard in the list. With memo,
only the card whose task prop reference actually changed gets re-rendered; the rest bail out early.
*/
const TaskCard = memo(TaskCardRoot) as unknown as typeof TaskCardRoot & {
  Header: typeof Header;
  Actions: typeof Actions;
  Badge: typeof Badge;
};

/*
memo(TaskCardRoot) returns a memoized component with no .Header, .Actions, .Badge
The cast tells TypeScript ahead of time that those properties will exist
Lines 51–53 actually attach them, making the cast truthful
Without the cast, line 51 (TaskCard.Header = Header) would fail at compile time because TypeScript sees TaskCard as React.MemoExoticComponent<...> which has no Header property.
*/
TaskCard.Header = Header;
TaskCard.Actions = Actions;
TaskCard.Badge = Badge;

export default TaskCard;
