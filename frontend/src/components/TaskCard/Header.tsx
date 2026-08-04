// Pattern: compound component part (Component patterns section) — rendered
// as `<TaskCard.Header>` by consumers; only meaningful inside a <TaskCard>.

import type { Task } from "../../types/task";

interface TaskCardHeaderProps {
  task: Task;
}

function Header({ task }: TaskCardHeaderProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
      {task.description && <p className="text-sm text-gray-500">{task.description}</p>}
    </div>
  );
}

export default Header;
