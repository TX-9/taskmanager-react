// GraphQL SDL — single source of truth for the API surface. The frontend's
// graphql-codegen (frontend/src/lib/codegen.ts) introspects this schema (via
// the running server or an exported .graphql file) to generate typed hooks.

import gql from "graphql-tag";

export const typeDefs = gql`
  enum TaskStatus {
    TODO
    IN_PROGRESS
    DONE
  }

  enum TaskPriority {
    LOW
    MEDIUM
    HIGH
  }

  type User {
    id: ID!
    email: String!
    createdAt: String!
  }

  type Task {
    id: ID!
    title: String!
    description: String
    status: TaskStatus!
    priority: TaskPriority!
    user: User!
    createdAt: String!
    updatedAt: String!
  }

  """
  Cursor-free, page-number pagination — simple to reason about for a task list
  that's typically sorted by createdAt and re-queried on filter changes.
  """
  type TaskPage {
    tasks: [Task!]!
    totalCount: Int!
    page: Int!
    limit: Int!
    hasNextPage: Boolean!
  }

  input TaskFilterInput {
    status: TaskStatus
    priority: TaskPriority
    search: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input CreateTaskInput {
    title: String!
    description: String
    priority: TaskPriority
  }

  input UpdateTaskInput {
    title: String
    description: String
    status: TaskStatus
    priority: TaskPriority
  }

  type Query {
    me: User
    tasks(page: Int = 1, limit: Int = 20, filter: TaskFilterInput): TaskPage!
    task(id: ID!): Task
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    register(email: String!, password: String!): AuthPayload!
    createTask(input: CreateTaskInput!): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): ID!
    toggleStatus(id: ID!): Task!
  }
`;
