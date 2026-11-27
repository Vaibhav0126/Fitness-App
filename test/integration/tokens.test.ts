import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import { uploadToken } from "@/lib/db/schema";
import {
  createToken,
  listTokens,
  MAX_ACTIVE_TOKENS,
  resolveToken,
  revokeToken,
  TokenLimitError,
} from "@/server/tokens";
import { testUsers } from "./helpers";

const db = getDb();
const users = testUsers(db, "test-tokens");
afterAll(() => users.cleanup());

describe("upload tokens", () => {
  it("returns the token once and stores only its SHA-256", async () => {
    const u = await users.create();
    const { id, token, lastFour } = await createToken(u, "iPhone");
    expect(token).toMatch(/^trn_[\w-]{43}$/);
    const [row] = await db.select().from(uploadToken).where(eq(uploadToken.id, id));
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token.slice(4));
    expect(lastFour).toBe(token.slice(-4));
    const listed = await listTokens(u);
    expect(listed).toEqual([expect.objectContaining({ id, name: "iPhone", lastFour })]);
    expect(JSON.stringify(listed)).not.toContain("Hash");
  });

  it("resolves active tokens, records last use, and stops after revoke", async () => {
    const u = await users.create();
    const { id, token } = await createToken(u, "HAE");
    expect(await resolveToken(token)).toMatchObject({ tokenId: id, userId: u, isDemo: false });
    const [row] = await db.select().from(uploadToken).where(eq(uploadToken.id, id));
    expect(row!.lastUsedAt).not.toBeNull();
    expect(await revokeToken(u, id)).toBe(true);
    expect(await resolveToken(token)).toBeNull();
    expect(await revokeToken(u, id)).toBe(false);
    expect(await listTokens(u)).toEqual([]);
  });

  it("can't revoke another user's token", async () => {
    const a = await users.create();
    const b = await users.create();
    const { id, token } = await createToken(a, "mine");
    expect(await revokeToken(b, id)).toBe(false);
    expect(await resolveToken(token)).not.toBeNull();
  });

  it(`limits active tokens to ${MAX_ACTIVE_TOKENS}`, async () => {
    const u = await users.create();
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await createToken(u, `t${i}`);
    await expect(createToken(u, "one too many")).rejects.toBeInstanceOf(TokenLimitError);
  });
});
