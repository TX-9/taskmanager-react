// Pattern: input validation with descriptive GraphQL errors — resolvers call
// these guards before touching the database so bad input never reaches Prisma
// and the client always gets a specific, actionable error message.

import { TaskPriority, TaskStatus } from "@prisma/client";
import { userInputError } from "./errors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

export function validateEmail(email: string): void {
  if (!email || !EMAIL_REGEX.test(email)) {
    throw userInputError("Please provide a valid email address.", { email });
  }
}

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw userInputError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`, {
      password: "too short",
    });
  }
}

export interface TaskInput {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
}

export function validateTaskInput(input: TaskInput): void {
  if (!input.title || input.title.trim().length === 0) {
    throw userInputError("Task title is required.", { title: "missing" });
  }
  if (input.title.length > MAX_TITLE_LENGTH) {
    throw userInputError(`Task title must be ${MAX_TITLE_LENGTH} characters or fewer.`, { title: "too long" });
  }
  if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
    throw userInputError(`Task description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`, {
      description: "too long",
    });
  }
  if (input.status && !Object.values(TaskStatus).includes(input.status)) {
    throw userInputError(`Invalid status: ${input.status}.`, { status: "invalid" });
  }
  if (input.priority && !Object.values(TaskPriority).includes(input.priority)) {
    throw userInputError(`Invalid priority: ${input.priority}.`, { priority: "invalid" });
  }
}

export function validatePagination(page: number, limit: number): void {
  if (page < 1) {
    throw userInputError("page must be 1 or greater.", { page: String(page) });
  }
  if (limit < 1 || limit > 100) {
    throw userInputError("limit must be between 1 and 100.", { limit: String(limit) });
  }
}
