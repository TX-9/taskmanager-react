// Pattern: DataLoader for N+1 prevention. Without this, resolving
// `Task.user` for a page of N tasks would issue N separate `SELECT * FROM users`
// queries. DataLoader batches all `.load(userId)` calls made within a single tick
// into one `findMany({ where: { id: { in: [...] } } })` and caches per-request.

import DataLoader from "dataloader";
import type { PrismaClient, User } from "@prisma/client";

export function createUserLoader(prisma: PrismaClient): DataLoader<string, User | null> {
  return new DataLoader<string, User | null>(async (userIds) => {
    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
    });

    const usersById = new Map(users.map((user) => [user.id, user]));

    // DataLoader requires the returned array to match the order (and length)
    // of the input keys exactly, including `null` for missing entries.
    return userIds.map((id) => usersById.get(id) ?? null);
  });
}
