// Pattern: descriptive GraphQL errors — typed error factories that attach a
// stable `extensions.code` so the frontend's errorLink (frontend/src/lib/apollo.ts)
// can branch on error type (e.g. UNAUTHENTICATED -> logout) instead of parsing strings.

import { GraphQLError } from "graphql";

export function authenticationError(message = "You must be logged in to perform this action."): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
  });
}

export function forbiddenError(message = "You do not have permission to perform this action."): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "FORBIDDEN", http: { status: 403 } },
  });
}

export function notFoundError(entity: string): GraphQLError {
  return new GraphQLError(`${entity} not found.`, {
    extensions: { code: "NOT_FOUND", http: { status: 404 } },
  });
}
/*
will be 
"extensions": {
            "code": "BAD_USER_INPUT",
            "invalidArgs": {
                "password": "too short"
            }
*/
export function userInputError(message: string, invalidArgs?: Record<string, string>): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT", http: { status: 400 }, invalidArgs },
  });
}
