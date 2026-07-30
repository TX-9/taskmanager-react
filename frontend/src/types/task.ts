// Pattern: discriminated unions for typed variant props (TypeScript section).
// TaskStatus/TaskPriority are string enums mirroring the GraphQL schema; the
// Badge* variant types below let components/TaskCard/Badge.tsx switch
// exhaustively on `variant` and get compile-time errors if a status/priority
// is ever added to the schema but not handled here.

import type { User } from "./user";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  user: User;
  createdAt: string;
  updatedAt: string;
}

export interface TaskPage {
  tasks: Task[];
  totalCount: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface TaskFilter {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
}

/** Discriminated union for TaskCard.Badge — see components/TaskCard/Badge.tsx */
export type BadgeProps =
  | { kind: "status"; value: TaskStatus }
  | { kind: "priority"; value: TaskPriority };

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
}
