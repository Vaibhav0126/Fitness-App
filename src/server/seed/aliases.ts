import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { exerciseAlias } from "@/lib/db/schema";
import { catalogAliasRows } from "@/lib/exercises/catalog";

/** Upserts the global exercise aliases (userId = null). Safe to run repeatedly. */
export async function seedAliases(db: Db): Promise<number> {
  const rows = catalogAliasRows().map((r) => ({ ...r, userId: null }));
  await db
    .insert(exerciseAlias)
    .values(rows)
    .onConflictDoUpdate({
      target: [exerciseAlias.userId, exerciseAlias.rawKey],
      set: {
        canonical: sql`excluded.canonical`,
        muscleGroup: sql`excluded.muscle_group`,
        isDumbbell: sql`excluded.is_dumbbell`,
        isBodyweight: sql`excluded.is_bodyweight`,
        updatedAt: new Date(),
      },
    });
  return rows.length;
}
