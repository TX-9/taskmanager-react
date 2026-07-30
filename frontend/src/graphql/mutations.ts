// GraphQL mutation documents, consumed by hooks/useTaskMutations.ts for
// optimistic create/update/delete/toggle flows. Plain template-literal
// strings — no `gql` tag, this variant has no Apollo Client.

import { TASK_FIELDS, USER_FIELDS } from "./fragments";

export const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        ...UserFields
      }
    }
  }
  ${USER_FIELDS}
`;

export const REGISTER_MUTATION = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password) {
      token
      user {
        ...UserFields
      }
    }
  }
  ${USER_FIELDS}
`;

export const CREATE_TASK_MUTATION = `
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`;

export const UPDATE_TASK_MUTATION = `
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`;

export const DELETE_TASK_MUTATION = `
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;

export const TOGGLE_STATUS_MUTATION = `
  mutation ToggleStatus($id: ID!) {
    toggleStatus(id: $id) {
      ...TaskFields
    }
  }
  ${TASK_FIELDS}
`;
