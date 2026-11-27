import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { generateToken, hashToken } from "@/lib/crypto";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { uploadToken, user } from "@/lib/db/schema";

/*
 * Upload tokens (spec §9): 32 random bytes, shown once, stored only as SHA-256,
 * revocable. Used as `Authorization: Bearer <token>` by the iOS Shortcut and
 * Health Auto Export's REST automation.
 */

export const MAX_ACTIVE_TOKENS = 10;

export interface TokenSummary {
  id: string;
  name: string;
  lastFour: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export async function listTokens(userId: string, db: Db = getDb()): Promise<TokenSummary[]> {
  return db
    .select({
      id: uploadToken.id,
      name: uploadToken.name,
      lastFour: uploadToken.lastFour,
      createdAt: uploadToken.createdAt,
      lastUsedAt: uploadToken.lastUsedAt,
    })
    .from(uploadToken)
    .where(scoped(userId, db).owns(uploadToken, isNull(uploadToken.revokedAt)))
    .orderBy(desc(uploadToken.createdAt));
}

export class TokenLimitError extends Error {}

/** Creates a token and returns the plaintext once. Only the hash is stored. */
export async function createToken(
  userId: string,
  name: string,
  db: Db = getDb(),
): Promise<{ id: string; token: string; lastFour: string }> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(uploadToken)
    .where(scoped(userId, db).owns(uploadToken, isNull(uploadToken.revokedAt)));
  if (n >= MAX_ACTIVE_TOKENS) throw new TokenLimitError(`You can have up to ${MAX_ACTIVE_TOKENS} tokens.`);
  const { token, hash, lastFour } = generateToken();
  const [row] = await scoped(userId, db)
    .insert(uploadToken, [{ name, tokenHash: hash, lastFour }])
    .returning({ id: uploadToken.id });
  return { id: row!.id, token, lastFour };
}

/** Revokes one of the user's tokens. Returns false when it isn't theirs or is already revoked. */
export async function revokeToken(userId: string, id: string, db: Db = getDb()): Promise<boolean> {
  const rows = await scoped(userId, db)
    .update(uploadToken, { revokedAt: new Date() }, eq(uploadToken.id, id), isNull(uploadToken.revokedAt))
    .returning({ id: uploadToken.id });
  return rows.length > 0;
}

export interface TokenOwner {
  tokenId: string;
  userId: string;
  isDemo: boolean;
  emailVerified: boolean;
}

/** Looks up an active token by its plaintext (hash compare in SQL; the hash is a unique key). */
export async function resolveToken(token: string, db: Db = getDb()): Promise<TokenOwner | null> {
  const [row] = await db
    .select({
      tokenId: uploadToken.id,
      userId: uploadToken.userId,
      isDemo: user.isDemo,
      emailVerified: user.emailVerified,
      lastUsedAt: uploadToken.lastUsedAt,
    })
    .from(uploadToken)
    .innerJoin(user, eq(user.id, uploadToken.userId))
    .where(and(eq(uploadToken.tokenHash, hashToken(token)), isNull(uploadToken.revokedAt)))
    .limit(1);
  if (!row) return null;
  // Record use, at most once a minute per token.
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(uploadToken).set({ lastUsedAt: new Date() }).where(eq(uploadToken.id, row.tokenId));
  }
  return {
    tokenId: row.tokenId,
    userId: row.userId,
    isDemo: Boolean(row.isDemo),
    emailVerified: row.emailVerified,
  };
}
