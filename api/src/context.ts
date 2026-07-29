// Pattern: JWT auth middleware — runs once per request, decodes the bearer
// token (if present) and attaches the current user id plus a fresh set of
// per-request DataLoaders to the GraphQL context. Resolvers that require auth
// check `context.userId` and throw via utils/errors when it's absent. For the
// full JWT flow this is one piece of — from the frontend's Login.tsx through
// to here — see ../../AUTH.md.

import type { IncomingMessage } from "http";
import { PrismaClient } from "@prisma/client";
import type DataLoader from "dataloader";
import type { User } from "@prisma/client";
import { verifyToken } from "./utils/auth";
import { createUserLoader } from "./loaders/userLoader";

export const prisma = new PrismaClient();

export interface GraphQLContext {
  prisma: PrismaClient;
  userId: string | null;
  loaders: {
    userLoader: DataLoader<string, User | null>;
  };
}

function extractToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export async function createContext({ req }: { req: IncomingMessage }): Promise<GraphQLContext> {
  const token = extractToken(req);
  const payload = token ? verifyToken(token) : null;

  return {
    prisma,
    userId: payload?.userId ?? null,
    // Fresh loaders per request: DataLoader's cache must not leak between requests.
    loaders: {
      userLoader: createUserLoader(prisma),
    },
  };
}
