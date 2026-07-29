// Pattern: JWT auth resolvers — login issues a token, `me` reads the current
// user off context.userId (populated by the auth middleware in src/context.ts).

import type { GraphQLContext } from "../../context";
import { hashPassword, signToken, verifyPassword } from "../../utils/auth";
import { authenticationError, userInputError } from "../../utils/errors";
import { validateEmail, validatePassword } from "../../utils/validation";

export const authResolvers = {
  Query: {
    me: async (_parent: unknown, _args: unknown, context: GraphQLContext) => {
      if (!context.userId) {
        return null;
      }
      return context.prisma.user.findUnique({ where: { id: context.userId } });
    },
  },
  Mutation: {
    login: async (
      _parent: unknown,
      args: { email: string; password: string },
      context: GraphQLContext,
    ) => {
      validateEmail(args.email);
      validatePassword(args.password);

      const user = await context.prisma.user.findUnique({ where: { email: args.email } });
      if (!user) {
        throw authenticationError("Invalid email or password.");
      }

      const passwordMatches = await verifyPassword(args.password, user.passwordHash);
      if (!passwordMatches) {
        throw authenticationError("Invalid email or password.");
      }

      const token = signToken({ userId: user.id });
      return { token, user };
    },

    register: async (
      _parent: unknown,
      args: { email: string; password: string },
      context: GraphQLContext,
    ) => {
      validateEmail(args.email);
      validatePassword(args.password);

      const existingUser = await context.prisma.user.findUnique({ where: { email: args.email } });
      if (existingUser) {
        throw userInputError("An account with this email already exists.", { email: args.email });
      }

      const passwordHash = await hashPassword(args.password);
      const user = await context.prisma.user.create({
        data: { email: args.email, passwordHash },
      });

      const token = signToken({ userId: user.id });
      return { token, user };
    },
  },
  User: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },
};

export function requireAuth(context: GraphQLContext): string {
  if (!context.userId) {
    throw authenticationError();
  }
  return context.userId;
}
