// Pattern: JWT auth — signing/verifying tokens and hashing passwords.
// Consumed by src/context.ts (per-request auth middleware) and
// src/schema/resolvers/auth.ts (login resolver).

import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
// process.env values are always `string`, but jsonwebtoken's `expiresIn`
// wants a template-literal type like "7d" — env vars can't carry that
// precision, so we assert it once here at the boundary.
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required. See .env.example.");
}

export interface JwtPayload {
  userId: string;
}

export async function hashPassword(plainTextPassword: string): Promise<string> {
  const SALT_ROUNDS = 10;
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}

// Creates a signed JWT: encodes `payload` as a JSON blob, signs it with
// JWT_SECRET so the server can later confirm it hasn't been tampered with,
// and embeds an expiry so stale tokens are automatically rejected.
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}

// Decodes and validates a JWT: checks the signature against JWT_SECRET and
// confirms the token hasn't expired. Returns the decoded payload on success,
// or null if the token is invalid, expired, or tampered with.
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JwtPayload;
  } catch {
    return null;
  }
}
