// Seed script — populates a demo user + tasks for local development.
// Run with `npm run seed` after `npm run prisma:migrate`.

import { PrismaClient, TaskPriority, TaskStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "demo@taskmanager.dev" },
    update: {},
    create: {
      email: "demo@taskmanager.dev",
      passwordHash,
    },
  });

  const seedTasks: Array<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
  }> = [
    {
      title: "Set up project repository",
      description: "Initialize the repo, configure linting and CI.",
      status: TaskStatus.DONE,
      priority: TaskPriority.MEDIUM,
    },
    {
      title: "Design database schema",
      description: "Model User and Task entities in Prisma.",
      status: TaskStatus.DONE,
      priority: TaskPriority.HIGH,
    },
    {
      title: "Implement GraphQL resolvers",
      description: "Auth, tasks query with pagination, mutations.",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
    },
    {
      title: "Build TaskCard compound component",
      description: "Header, Actions, Badge subcomponents.",
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
    },
    {
      title: "Wire up optimistic mutations",
      description: "Create, delete, and toggle status optimistically.",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
    },
    {
      title: "Add task list virtualization",
      description: "Use @tanstack/react-virtual for large lists.",
      status: TaskStatus.TODO,
      priority: TaskPriority.LOW,
    },
  ];

  for (const task of seedTasks) {
    await prisma.task.create({
      data: { ...task, userId: user.id },
    });
  }

  console.log(`Seeded user ${user.email} with ${seedTasks.length} tasks.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
