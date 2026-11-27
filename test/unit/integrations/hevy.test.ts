import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HevyApiError, hevyHttp, hevyWorkoutsPageSchema } from "@/lib/integrations/hevy/client";
import { hevyWorkoutToSets } from "@/lib/integrations/hevy/map";
import { setRecordSchema } from "@/lib/importers/schemas";

const fixture = (f: string) =>
  JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../../fixtures/hevy", f), "utf8"));

function fakeFetch(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: Array<{ url: URL; headers: Headers }> = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: new Headers(init?.headers) });
    const r = routes[url.pathname] ?? { status: 404 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, calls };
}

describe("Hevy client", () => {
  it("sends the api-key header, page/pageSize ≤ 10 and since", async () => {
    const { f, calls } = fakeFetch({
      "/v1/workouts": { body: fixture("workouts-page-1.json") },
      "/v1/workouts/events": { body: fixture("events-page-1.json") },
      "/v1/user/info": { body: fixture("user-info.json") },
    });
    const api = hevyHttp("test-key-0123456789abcdef", { fetch: f });
    expect((await api.userInfo()).is_pro).toBe(true);
    expect((await api.workouts(1)).workouts).toHaveLength(2);
    const ev = await api.events("2026-11-25T00:00:00Z", 1);
    expect(ev.events.map((e) => e.type)).toEqual(["updated", "deleted"]);
    expect(calls.every((c) => c.headers.get("api-key") === "test-key-0123456789abcdef")).toBe(true);
    expect(calls[0]!.url.origin).toBe("https://api.hevyapp.com");
    expect(calls[1]!.url.searchParams.get("pageSize")).toBe("10");
    expect(calls[2]!.url.searchParams.get("since")).toBe("2026-11-25T00:00:00Z");
  });

  it("maps 401 to an unauthorized error and 429 to rate limited", async () => {
    const api401 = hevyHttp("k".repeat(20), { fetch: fakeFetch({ "/v1/user/info": { status: 401 } }).f });
    await expect(api401.userInfo()).rejects.toMatchObject({ unauthorized: true });
    const api429 = hevyHttp("k".repeat(20), { fetch: fakeFetch({ "/v1/workouts": { status: 429 } }).f });
    const err = await api429.workouts(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HevyApiError);
    expect((err as HevyApiError).rateLimited).toBe(true);
  });

  it("rejects responses that don't match the documented shape", async () => {
    const api = hevyHttp("k".repeat(20), {
      fetch: fakeFetch({ "/v1/workouts": { body: { nope: true } } }).f,
    });
    await expect(api.workouts(1)).rejects.toMatchObject({ status: 502 });
  });
});

describe("Hevy workout → set records", () => {
  const page = hevyWorkoutsPageSchema.parse(fixture("workouts-page-1.json"));
  const upperA = page.workouts.find((w) => w.title === "Upper A")!;

  it("keeps set types, skips cardio sets without reps, and validates", () => {
    const sets = hevyWorkoutToSets(upperA);
    expect(sets).toHaveLength(5);
    expect(sets.every((s) => setRecordSchema.safeParse(s).success)).toBe(true);
    expect(sets[0]).toMatchObject({
      externalId: `${upperA.id}|0|0`,
      exerciseRaw: "Bench Press (Barbell)",
      setType: "warmup",
      performedAt: "2026-11-23T21:05:00.000Z",
      sessionEnd: "2026-11-23T22:10:00.000Z",
      sessionTitle: "Upper A",
    });
    expect(sets.map((s) => s.exerciseRaw)).not.toContain("Treadmill");
  });

  it("uses one externalId prefix per workout", () => {
    expect(new Set(hevyWorkoutToSets(upperA).map((s) => s.externalId.split("|")[0]))).toEqual(
      new Set([upperA.id]),
    );
  });
});
