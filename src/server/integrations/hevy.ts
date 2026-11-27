import "server-only";
import { and, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb, type Db } from "@/lib/db/client";
import { scoped } from "@/lib/db/scoped";
import { connection, strengthSet, workout } from "@/lib/db/schema";
import { setRecordSchema, type SetRecord } from "@/lib/importers/schemas";
import { type HevyApi, HevyApiError, hevyHttp, type HevyWorkout } from "@/lib/integrations/hevy/client";
import { hevySetPrefix, hevyWorkoutToSets } from "@/lib/integrations/hevy/map";
import { bumpDataVersion } from "../cache";
import { addJobCounts, failJob, finishJob, startJob } from "../importers/jobs";
import { mergeSets } from "../importers/merge";

/*
 * Hevy API sync (spec §4.4). The key is validated with one request, stored AES-256-GCM
 * encrypted, and never returned (only its last 4 characters).
 *
 * Sync is resumable. `connection.sync_cursor` holds JSON:
 *   { mode: "full", page, startedAt }   paging /v1/workouts (first sync)
 *   { mode: "events", since, page? }    paging /v1/workouts/events?since=… (incremental)
 * When a run hits its time budget it saves the next page and stops; the next run continues.
 * Each workout is applied as a whole: its sets replace the stored ones (sets removed in Hevy
 * are deleted), and "deleted" events remove the workout's sets and session.
 */

export const HEVY = "hevy";

const cursorSchema = z.union([
  z.object({ mode: z.literal("full"), page: z.number().int().min(1), startedAt: z.string() }),
  z.object({ mode: z.literal("events"), since: z.string(), page: z.number().int().min(1).optional() }),
]);
type Cursor = z.infer<typeof cursorSchema>;

export type ApiFactory = (apiKey: string) => HevyApi;
const defaultFactory: ApiFactory = (k) => hevyHttp(k);

export class HevyKeyError extends Error {}

export interface HevyConnectionView {
  connected: boolean;
  lastFour: string | null;
  status: string | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  syncing: boolean;
}

export async function getHevyConnection(userId: string, db: Db = getDb()): Promise<HevyConnectionView> {
  const [c] = await scoped(userId, db).select(connection, eq(connection.provider, HEVY));
  if (!c)
    return {
      connected: false,
      lastFour: null,
      status: null,
      lastSyncAt: null,
      lastError: null,
      syncing: false,
    };
  const cursor = parseCursor(c.syncCursor);
  return {
    connected: true,
    lastFour: c.credentialLastFour,
    status: c.status,
    lastSyncAt: c.lastSyncAt,
    lastError: c.lastError,
    syncing: Boolean(cursor && (cursor.mode === "full" || cursor.page)),
  };
}

/** Validates the key with GET /v1/user/info, then stores it encrypted. */
export async function saveHevyKey(
  userId: string,
  rawKey: string,
  db: Db = getDb(),
  factory: ApiFactory = defaultFactory,
): Promise<{ lastFour: string; username: string | null }> {
  const apiKey = rawKey.trim();
  if (!/^[\w-]{16,200}$/.test(apiKey)) throw new HevyKeyError("That doesn't look like a Hevy API key.");
  let info;
  try {
    info = await factory(apiKey).userInfo();
  } catch (e) {
    if (e instanceof HevyApiError && e.unauthorized)
      throw new HevyKeyError(
        "Hevy rejected that key. Copy it again from developers.hevy.com → API key & webhooks.",
      );
    if (e instanceof HevyApiError) throw new HevyKeyError(e.message);
    throw e;
  }
  const lastFour = apiKey.slice(-4);
  const values = {
    apiKeyEnc: encrypt(apiKey),
    credentialLastFour: lastFour,
    externalAthleteId: info.id,
    status: "active",
    lastError: null,
    syncCursor: null,
    lastSyncAt: null,
  };
  // A different Hevy account means a fresh full sync; same account keeps the stored sets.
  await scoped(userId, db)
    .insert(connection, [{ provider: HEVY, ...values }])
    .onConflictDoUpdate({
      target: [connection.userId, connection.provider],
      set: { ...values, updatedAt: new Date() },
    });
  return { lastFour, username: info.username ?? null };
}

/** Removes the key. Synced workouts stay (they're the user's data; delete via account deletion). */
export async function disconnectHevy(userId: string, db: Db = getDb()): Promise<void> {
  await scoped(userId, db).delete(connection, eq(connection.provider, HEVY));
}

function parseCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const p = cursorSchema.safeParse(JSON.parse(raw));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export interface SyncResult {
  status: "done" | "partial" | "error" | "not_connected";
  upserted: number;
  deleted: number;
  sets: { inserted: number; updated: number; unchanged: number; removed: number };
  pages: number;
  error?: string;
}

/** Replaces one Hevy workout's sets. Returns set counts. */
async function applyWorkout(userId: string, w: HevyWorkout, db: Db) {
  const rows: SetRecord[] = [];
  for (const r of hevyWorkoutToSets(w)) {
    const p = setRecordSchema.safeParse(r);
    if (p.success) rows.push(p.data);
  }
  const prefix = hevySetPrefix(w.id);
  const ids = rows.map((r) => r.externalId);
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db; // the transaction exposes the same query API as the pool-bound Db
    // Sessions the workout's sets pointed at before (its start time may have changed).
    const before = await t
      .select({ workoutId: strengthSet.workoutId })
      .from(strengthSet)
      .where(
        and(
          eq(strengthSet.userId, userId),
          eq(strengthSet.source, HEVY),
          like(strengthSet.externalId, `${prefix}%`),
        ),
      );
    const stale = await t
      .delete(strengthSet)
      .where(
        and(
          eq(strengthSet.userId, userId),
          eq(strengthSet.source, HEVY),
          like(strengthSet.externalId, `${prefix}%`),
          ids.length ? notInArray(strengthSet.externalId, ids) : undefined,
        ),
      )
      .returning({ workoutId: strengthSet.workoutId });
    const merged = rows.length
      ? await mergeSets(userId, HEVY, rows, t, { overwrite: true })
      : { inserted: 0, updated: 0, unchanged: 0 };
    await deleteOrphanSessions(
      userId,
      before.map((b) => b.workoutId),
      t,
    );
    return { ...merged, removed: stale.length };
  });
}

async function deleteWorkout(userId: string, hevyId: string, db: Db): Promise<number> {
  const gone = await db
    .delete(strengthSet)
    .where(
      and(
        eq(strengthSet.userId, userId),
        eq(strengthSet.source, HEVY),
        like(strengthSet.externalId, `${hevySetPrefix(hevyId)}%`),
      ),
    )
    .returning({ workoutId: strengthSet.workoutId });
  await deleteOrphanSessions(
    userId,
    gone.map((s) => s.workoutId),
    db,
  );
  return gone.length;
}

/** Deletes Hevy session workouts that no longer have any sets. */
async function deleteOrphanSessions(userId: string, ids: Array<string | null>, db: Db) {
  const candidates = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!candidates.length) return;
  await db
    .delete(workout)
    .where(
      and(
        eq(workout.userId, userId),
        eq(workout.source, HEVY),
        inArray(workout.id, candidates),
        sql`not exists (select 1 from ${strengthSet} where ${strengthSet.workoutId} = ${workout.id})`,
      ),
    );
}

/**
 * Runs (or resumes) a sync for one user. Stops cleanly before `deadline` and saves where
 * it got to. Never throws for Hevy errors: they're recorded on the connection.
 */
export async function syncHevy(
  userId: string,
  opts: { db?: Db; factory?: ApiFactory; deadline?: number; now?: () => Date } = {},
): Promise<SyncResult> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? (() => new Date());
  const deadline = opts.deadline ?? Date.now() + 45_000;
  const result: SyncResult = {
    status: "done",
    upserted: 0,
    deleted: 0,
    sets: { inserted: 0, updated: 0, unchanged: 0, removed: 0 },
    pages: 0,
  };
  const s = scoped(userId, db);
  const [conn] = await s.select(connection, eq(connection.provider, HEVY));
  if (!conn?.apiKeyEnc) return { ...result, status: "not_connected" };

  const api = (opts.factory ?? defaultFactory)(decrypt(conn.apiKeyEnc));
  // 5 minutes of overlap absorbs clock skew between us and Hevy; re-applying an event is a no-op.
  const runStartedAt = new Date(now().getTime() - 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  let cursor: Cursor = parseCursor(conn.syncCursor) ?? { mode: "full", page: 1, startedAt: runStartedAt };
  const jobId = await startJob(userId, cursor.mode === "full" ? "Hevy sync (full)" : "Hevy sync", db);

  const addSets = (c: { inserted: number; updated: number; unchanged: number; removed: number }) => {
    result.sets.inserted += c.inserted;
    result.sets.updated += c.updated;
    result.sets.unchanged += c.unchanged;
    result.sets.removed += c.removed;
  };
  const save = (fields: Partial<typeof connection.$inferInsert>) =>
    s.update(connection, { ...fields, updatedAt: new Date() }, eq(connection.id, conn.id));

  try {
    for (;;) {
      if (Date.now() > deadline) {
        result.status = "partial";
        break;
      }
      if (cursor.mode === "full") {
        const page = await api.workouts(cursor.page);
        result.pages++;
        for (const w of page.workouts) {
          addSets(await applyWorkout(userId, w, db));
          result.upserted++;
        }
        cursor =
          page.page >= page.page_count || page.workouts.length === 0
            ? // Events since the full sync began catch anything changed while it ran.
              { mode: "events", since: cursor.startedAt }
            : { ...cursor, page: cursor.page + 1 };
      } else {
        const pageNo = cursor.page ?? 1;
        const page = await api.events(cursor.since, pageNo);
        result.pages++;
        for (const ev of page.events) {
          if (ev.type === "updated") {
            addSets(await applyWorkout(userId, ev.workout, db));
            result.upserted++;
          } else {
            result.sets.removed += await deleteWorkout(userId, ev.id, db);
            result.deleted++;
          }
        }
        if (pageNo >= page.page_count || page.events.length === 0) {
          cursor = { mode: "events", since: runStartedAt };
          break;
        }
        cursor = { ...cursor, page: pageNo + 1 };
      }
      await save({ syncCursor: JSON.stringify(cursor) });
    }
    await save({
      syncCursor: JSON.stringify(cursor),
      status: "active",
      lastError: null,
      ...(result.status === "done" ? { lastSyncAt: now() } : {}),
    });
    const counts = {
      hevyWorkoutsUpserted: result.upserted,
      hevyWorkoutsDeleted: result.deleted,
      setsInserted: result.sets.inserted,
      setsUpdated: result.sets.updated,
      setsUnchanged: result.sets.unchanged,
      setsRemoved: result.sets.removed,
    };
    await addJobCounts(userId, jobId, counts, db);
    await finishJob(userId, jobId, db);
  } catch (e) {
    const message = e instanceof HevyApiError ? e.message : "Sync failed";
    if (!(e instanceof HevyApiError)) console.error("hevy sync failed", e);
    await save({
      syncCursor: JSON.stringify(cursor),
      status: e instanceof HevyApiError && e.unauthorized ? "invalid_key" : "error",
      lastError: message,
    });
    await failJob(userId, jobId, message, db);
    result.status = "error";
    result.error = message;
  }
  if (result.sets.inserted || result.sets.updated || result.sets.removed) await bumpDataVersion(userId, db);
  return result;
}
