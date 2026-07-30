// GraphQL query documents, sent via apiClient.ts's graphqlRequest(). Plain
// template-literal strings — no `gql` tag, since nothing here parses the
// document at build time the way Apollo's InMemoryCache normalization did.

import { TASK_FIELDS, USER_FIELDS } from "./fragments";

export const ME_QUERY = `
  query Me {
    me {
      ...UserFields
    }
  }
  ${USER_FIELDS}
`;

export const TASKS_QUERY = `
  query Tasks($page: Int, $limit: Int, $filter: TaskFilterInput) {
    tasks(page: $page, limit: $limit, filter: $filter) {
      tasks {
        ...TaskFields
      }
      totalCount
      page
      limit
      hasNextPage
    }
  }
  ${TASK_FIELDS}
`;
