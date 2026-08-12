// Pattern: paginated queries + protected mutations. Every mutation here calls
// requireAuth() (JWT auth middleware) and validateTaskInput() (descriptive
// GraphQL errors) before touching Prisma. The Task.user field resolver uses
// the per-request DataLoader instead of `prisma.user.findUnique` directly,
// so a page of 20 tasks issues one batched user query instead of 20.

import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import type { GraphQLContext } from "../../context";
import { notFoundError } from "../../utils/errors";
import { validatePagination, validateTaskInput } from "../../utils/validation";
import { requireAuth } from "./auth";

interface TaskFilterInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
}

export const taskResolvers = {
  Query: {
    tasks: async (
      _parent: unknown,
      args: { page?: number; limit?: number; filter?: TaskFilterInput },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      const page = args.page ?? 1;
      const limit = args.limit ?? 20;
      validatePagination(page, limit);

      const where: Prisma.TaskWhereInput = {
        userId,
        ...(args.filter?.status ? { status: args.filter.status } : {}),
        ...(args.filter?.priority ? { priority: args.filter.priority } : {}),
        ...(args.filter?.search
          ? { title: { contains: args.filter.search, mode: "insensitive" as const } }
          : {}),
      };

      const [tasks, totalCount] = await Promise.all([
        context.prisma.task.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        context.prisma.task.count({ where }),
      ]);

      return {
        tasks,
        totalCount,
        page,
        limit,
        hasNextPage: page * limit < totalCount,
      };
    },

    task: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);
      return context.prisma.task.findFirst({ where: { id: args.id, userId } });
    },
  },

  Mutation: {
    createTask: async (
      _parent: unknown,
      args: { input: { title: string; description?: string; priority?: TaskPriority } },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);
      validateTaskInput(args.input);

      const task = await context.prisma.task.create({
        data: {
          title: args.input.title,
          description: args.input.description ?? null,
          priority: args.input.priority ?? undefined,
          userId,
        },
      });

      return task;
    },

    updateTask: async (
      _parent: unknown,
      args: {
        id: string;
        input: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority };
      },
      context: GraphQLContext,
    ) => {
      const userId = requireAuth(context);

      const existing = await context.prisma.task.findFirst({ where: { id: args.id, userId } });
      if (!existing) {
        throw notFoundError("Task");
      }

      if (args.input.title !== undefined) {
        validateTaskInput({ ...args.input, title: args.input.title });
      }

      const task = await context.prisma.task.update({
        where: { id: args.id },
        data: {
          title: args.input.title,
          description: args.input.description,
          status: args.input.status,
          priority: args.input.priority,
        },
      });

      return task;
    },

    deleteTask: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);

      const existing = await context.prisma.task.findFirst({ where: { id: args.id, userId } });
      if (!existing) {
        throw notFoundError("Task");
      }

      await context.prisma.task.delete({ where: { id: args.id } });
      return args.id;
    },

    toggleStatus: async (_parent: unknown, args: { id: string }, context: GraphQLContext) => {
      const userId = requireAuth(context);

      const existing = await context.prisma.task.findFirst({ where: { id: args.id, userId } });
      if (!existing) {
        throw notFoundError("Task");
      }

      const nextStatus: TaskStatus = existing.status === "DONE" ? "TODO" : "DONE";

      const task = await context.prisma.task.update({
        where: { id: args.id },
        data: { status: nextStatus },
      });

      return task;
    },
  },
  // GraphQL field resolver block for the Task typ
  Task: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
    updatedAt: (parent: { updatedAt: Date }) => parent.updatedAt.toISOString(),
    // The DataLoader batches all userId lookups from a single request into one DB query, then distributes the results back to each task.
    user: (parent: { userId: string }, _args: unknown, context: GraphQLContext) => {
      return context.loaders.userLoader.load(parent.userId);
    },
  },
};
