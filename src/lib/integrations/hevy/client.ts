import { z } from "zod";

/*
 * Hevy public API (verified 2026-11-27 against https://developers.hevy.com/openapi.json,
 * API version 0.0.1). Auth: `api-key: <key>` header (Hevy Pro). Base: https://api.hevyapp.com.
 *   GET /v1/user/info                         → { data: { id, username, name, weight_unit, is_pro, ... } }
 *   GET /v1/workouts?page&pageSize (≤10)       → { page, page_count, workouts: Workout[] }
 *   GET /v1/workouts/events?since&page&pageSize (≤10), newest first
 *                                              → { page, page_count, events: ({type:"updated", workout} | {type:"deleted", id, deleted_at})[] }
 * Rate limits: 1,000 requests / 5 min per IP; 429 has an empty body and no Retry-After.
 *
 * Everything here is behind the HevyApi interface so sync logic is tested against recorded
 * fixtures (test/fixtures/hevy/) without network access.
 */

export const HEVY_BASE_URL = "https://api.hevyapp.com";
export const HEVY_PAGE_SIZE = 10;

const num = z.number().nullish();

export const hevySetSchema = z
  .object({
    index: z.number(),
    type: z.string().nullish(),
    weight_kg: num,
    reps: num,
    distance_meters: num,
    duration_seconds: num,
    rpe: num,
  })
  .passthrough();

export const hevyWorkoutSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().nullish(),
    start_time: z.string(),
    end_time: z.string().nullish(),
    updated_at: z.string().nullish(),
    exercises: z
      .array(
        z
          .object({
            index: z.number(),
            title: z.string(),
            exercise_template_id: z.string().nullish(),
            sets: z.array(hevySetSchema),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export type HevyWorkout = z.infer<typeof hevyWorkoutSchema>;

export const hevyWorkoutsPageSchema = z.object({
  page: z.number(),
  page_count: z.number(),
  workouts: z.array(hevyWorkoutSchema),
});

export const hevyEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("updated"), workout: hevyWorkoutSchema }).passthrough(),
  z
    .object({ type: z.literal("deleted"), id: z.string().min(1), deleted_at: z.string().nullish() })
    .passthrough(),
]);

export type HevyEvent = z.infer<typeof hevyEventSchema>;

export const hevyEventsPageSchema = z.object({
  page: z.number(),
  page_count: z.number(),
  events: z.array(hevyEventSchema),
});

export const hevyUserInfoSchema = z.object({
  data: z
    .object({
      id: z.string(),
      username: z.string().nullish(),
      name: z.string().nullish(),
      weight_unit: z.string().nullish(),
      is_pro: z.boolean().nullish(),
    })
    .passthrough(),
});

export type HevyUserInfo = z.infer<typeof hevyUserInfoSchema>["data"];

export interface HevyApi {
  userInfo(): Promise<HevyUserInfo>;
  workouts(page: number): Promise<z.infer<typeof hevyWorkoutsPageSchema>>;
  events(since: string, page: number): Promise<z.infer<typeof hevyEventsPageSchema>>;
}

export class HevyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HevyApiError";
  }
  /** The key is wrong, revoked, or Hevy Pro has lapsed. */
  get unauthorized() {
    return this.status === 401 || this.status === 403;
  }
  get rateLimited() {
    return this.status === 429;
  }
}

export function hevyHttp(
  apiKey: string,
  opts: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {},
): HevyApi {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? HEVY_BASE_URL;
  async function get<T>(path: string, params: Record<string, string | number>, schema: z.ZodType<T>) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: { "api-key": apiKey, accept: "application/json" },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        cache: "no-store",
      });
    } catch (e) {
      throw new HevyApiError(0, `Couldn't reach Hevy: ${(e as Error).message}`);
    }
    if (!res.ok) {
      const msg =
        res.status === 401 || res.status === 403
          ? "Hevy rejected the API key (revoked, or Hevy Pro expired?)"
          : res.status === 429
            ? "Hevy rate limit reached; try again in a few minutes"
            : `Hevy API error ${res.status}`;
      throw new HevyApiError(res.status, msg);
    }
    const parsed = schema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw new HevyApiError(502, `Unexpected Hevy response (${i?.path.join(".")}: ${i?.message})`);
    }
    return parsed.data;
  }
  return {
    userInfo: async () => (await get("/v1/user/info", {}, hevyUserInfoSchema)).data,
    workouts: (page) => get("/v1/workouts", { page, pageSize: HEVY_PAGE_SIZE }, hevyWorkoutsPageSchema),
    events: (since, page) =>
      get("/v1/workouts/events", { since, page, pageSize: HEVY_PAGE_SIZE }, hevyEventsPageSchema),
  };
}
