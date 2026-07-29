// Merges the per-domain resolver maps into the single object Apollo Server
// expects. Kept as a thin merge layer so auth.ts and tasks.ts stay focused.

import { authResolvers } from "./auth";
import { taskResolvers } from "./tasks";

export const resolvers = {
  Query: {
    ...authResolvers.Query,
    ...taskResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...taskResolvers.Mutation,
  },
  User: {
    ...authResolvers.User,
  },
  Task: {
    ...taskResolvers.Task,
  },
};
