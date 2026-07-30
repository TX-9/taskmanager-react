// Shared fragments — reused across queries/mutations so every Task/User
// selection stays consistent regardless of which operation fetched it.
// Plain template-literal strings (no `gql` tag, no graphql-tag dependency —
// this variant has no Apollo Client to parse/normalize documents).

export const TASK_FIELDS = `
  fragment TaskFields on Task {
    id
    title
    description
    status
    priority
    createdAt
    updatedAt
    user {
      id
      email
    }
  }
`;

export const USER_FIELDS = `
  fragment UserFields on User {
    id
    email
    createdAt
  }
`;
