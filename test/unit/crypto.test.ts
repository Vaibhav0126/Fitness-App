import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, generateToken, hashToken, needsReencrypt, safeEqual } from "@/lib/crypto";

const k1 = randomBytes(32).toString("base64");
const k2 = randomBytes(32).toString("base64");

describe("AES-256-GCM", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("hevy-key-1234", { current: k1 });
    const b = encrypt("hevy-key-1234", { current: k1 });
    expect(a).not.toBe(b);
    expect(decrypt(a, { current: k1 })).toBe("hevy-key-1234");
  });

  it("detects tampering", () => {
    const c = encrypt("secret", { current: k1 });
    const parts = c.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join(":"), { current: k1 })).toThrow();
  });

  it("decrypts with the previous key during rotation", () => {
    const old = encrypt("secret", { current: k1 });
    const ring = { current: k2, previous: k1 };
    expect(decrypt(old, ring)).toBe("secret");
    expect(needsReencrypt(old, ring)).toBe(true);
    expect(needsReencrypt(encrypt("secret", ring), ring)).toBe(false);
    expect(() => decrypt(old, { current: k2 })).toThrow(/no configured key/);
  });

  it("rejects keys that are not 32 bytes", () => {
    expect(() => encrypt("x", { current: Buffer.from("short").toString("base64") })).toThrow(/32 bytes/);
  });
});

describe("upload tokens", () => {
  it("are random, hashed with SHA-256 and expose only the last four characters", () => {
    const t = generateToken();
    expect(t.token).toMatch(/^trn_[A-Za-z0-9_-]{43}$/);
    expect(t.hash).toBe(hashToken(t.token));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.lastFour).toBe(t.token.slice(-4));
    expect(generateToken().token).not.toBe(t.token);
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
